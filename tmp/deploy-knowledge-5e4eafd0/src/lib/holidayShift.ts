import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";
import { shouldDeployTemplateOnDate, weekdayOf } from "@/lib/roster/weeklyRecurrence";

export const HOLIDAY_ALERT_LOOKAHEAD_DAYS = Number(process.env.HOLIDAY_ALERT_LOOKAHEAD_DAYS ?? 45);
export type HolidayActionStatus = "pending" | "deleted" | "keep" | "changed" | "no_shift";

type Template = { template_id: number; kaipoke_cs_id: string; weekday: number; active: boolean; start_time: string; end_time: string; service_code: string | null; required_staff_count: number; holiday_off: boolean; effective_from: string | null; effective_to: string | null; is_biweekly: boolean | null; nth_weeks: number[] | null };
type Holiday = { holiday_date: string; holiday_name: string };
type Shift = { shift_id: number; kaipoke_cs_id: string | null; shift_start_date: string | null; shift_start_time: string | null; shift_end_time: string | null; service_code: string | null; required_staff_count: number };

const hm = (v: string | null | undefined) => (v ?? "").slice(0, 5);
const dateJst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
const addDays = (ymd: string, days: number) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const severity = (days: number) => days <= 2 ? 5 : days <= 6 ? 4 : days <= 13 ? 3 : days <= 29 ? 2 : 1;

export async function scanHolidayShifts() {
  const from = dateJst();
  const to = addDays(from, HOLIDAY_ALERT_LOOKAHEAD_DAYS);
  const [{ data: holidays, error: holidayError }, { data: templates, error: templateError }] = await Promise.all([
    supabaseAdmin.from("holiday_master").select("holiday_date, holiday_name").eq("is_active", true).gte("holiday_date", from).lte("holiday_date", to).order("holiday_date"),
    supabaseAdmin.from("shift_weekly_template").select("template_id, kaipoke_cs_id, weekday, start_time, end_time, service_code, required_staff_count, holiday_off, effective_from, effective_to, is_biweekly, nth_weeks").eq("active", true).eq("holiday_off", true),
  ]);
  if (holidayError) throw holidayError;
  if (templateError) throw templateError;
  const hs = (holidays ?? []) as Holiday[];
  const ts = (templates ?? []) as Template[];
  let withShift = 0, alerts = 0, skipped = 0, errors = 0;
  for (const holiday of hs) {
    const targetTemplates = [] as Template[];
    for (const template of ts) {
      if (template.weekday !== weekdayOf(holiday.holiday_date)) continue;
      let previousServiceDate: string | null = null;
      if (template.is_biweekly && !(template.nth_weeks?.length)) {
        const { data: previous } = await supabaseAdmin.from("shift")
          .select("shift_start_date")
          .eq("kaipoke_cs_id", template.kaipoke_cs_id)
          .lt("shift_start_date", holiday.holiday_date)
          .eq("shift_start_time", template.start_time)
          .eq("shift_end_time", template.end_time)
          .eq("service_code", template.service_code)
          .eq("required_staff_count", template.required_staff_count)
          .order("shift_start_date", { ascending: false })
          .limit(1);
        previousServiceDate = previous?.[0]?.shift_start_date ?? null;
      }
      if (shouldDeployTemplateOnDate(template, holiday.holiday_date, previousServiceDate).include) targetTemplates.push(template);
    }
    for (const template of targetTemplates) {
      try {
        const { data: shifts, error: shiftError } = await supabaseAdmin.from("shift")
          .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, service_code, required_staff_count")
          .eq("kaipoke_cs_id", template.kaipoke_cs_id).eq("shift_start_date", holiday.holiday_date)
          .eq("shift_start_time", template.start_time).eq("shift_end_time", template.end_time)
          .eq("service_code", template.service_code).eq("required_staff_count", template.required_staff_count);
        if (shiftError) throw shiftError;
        const matched = (shifts ?? []) as Shift[];
        if (!matched.length) continue; // no_shift は追加シフトを見逃さないため永続確定しない
        withShift += matched.length;
        for (const shift of matched) {
          const { data: action, error: actionError } = await supabaseAdmin.from("holiday_shift_action")
            .select("id,status").eq("holiday_date", holiday.holiday_date).eq("weekly_shift_id", template.template_id).eq("shift_id", shift.shift_id).maybeSingle();
          if (actionError) throw actionError;
          if (action && action.status !== "pending") { skipped++; continue; }
          if (!action) {
            const { error } = await supabaseAdmin.from("holiday_shift_action").insert({ holiday_date: holiday.holiday_date, weekly_shift_id: template.template_id, shift_id: shift.shift_id, client_id: template.kaipoke_cs_id, status: "pending" });
            if (error && (error as { code?: string }).code !== "23505") throw error;
          }
          const days = Math.round((Date.parse(`${holiday.holiday_date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
          const message = `【祝日シフト確認】${holiday.holiday_date}（${holiday.holiday_name}） 利用者:${template.kaipoke_cs_id} ${hm(template.start_time)}～${hm(template.end_time)}。週間シフトでは「祝日はお休み」に設定されていますが、この日の月間シフトが登録されています。`;
          const ensured = await ensureSystemAlert({ message, visible_roles: ["admin", "manager"], kaipoke_cs_id: template.kaipoke_cs_id, shift_id: String(shift.shift_id) });
          await supabaseAdmin.from("alert_log").update({ severity: severity(days), updated_at: new Date().toISOString() }).eq("id", ensured.id ?? "");
          if (ensured.created) alerts++;
        }
      } catch (error) {
        errors++;
        console.error("[holiday-shift] item error", { holiday_date: holiday.holiday_date, client_id: template.kaipoke_cs_id, weekly_shift_id: template.template_id, error });
      }
    }
  }
  const result = { holidayCount: hs.length, holidayOffWeeklyShiftCount: ts.length, monthlyShiftCount: withShift, newAlertCount: alerts, processedSkippedCount: skipped, errorCount: errors, from, to };
  console.info("[cron][holiday-shift] result", result);
  return result;
}
