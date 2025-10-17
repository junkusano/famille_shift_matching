// /src/app/api/roster/weekly/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate } from "@/types/shift-weekly-template";

// ==== helpers ====
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;

function monthStartEnd(yyyyMm: string): { start: string; end: string; days: string[] } {
  const [y, m] = yyyyMm.split("-").map((v) => parseInt(v, 10));
  if (!y || !m) throw new Error(`Invalid month: ${yyyyMm}`);
  const startDate = new Date(Date.UTC(y, m - 1, 1));
  const endDate = new Date(Date.UTC(y, m, 0));
  const days: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(ymd(new Date(d)));
  }
  return { start: ymd(startDate), end: ymd(endDate), days };
}

function weekOfMonth(day: number): number {
  return Math.floor((day - 1) / 7) + 1; // 1..5
}
function weekdayOf(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay();
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart);
  const ae = timeToMinutes(aEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return as < be && ae > bs;
}

function isWithinEffectiveRange(
  t: Pick<ShiftWeeklyTemplate, "effective_from" | "effective_to" | "active">,
  monthStart: string,
  monthEnd: string
): boolean {
  const fromOk = !t.effective_from || t.effective_from <= monthEnd;
  const toOk = !t.effective_to || t.effective_to >= monthStart;
  return fromOk && toOk && t.active;
}

function passesRecurrence(t: ShiftWeeklyTemplate, dateStr: string): boolean {
  // 第n週指定
  if (t.nth_weeks && t.nth_weeks.length > 0) {
    const nth = weekOfMonth(new Date(dateStr + "T00:00:00Z").getUTCDate());
    if (!t.nth_weeks.includes(nth)) return false;
  }
  // 隔週指定
  if (t.is_biweekly) {
    const anchor = t.effective_from
      ? new Date(t.effective_from + "T00:00:00Z")
      : new Date(dateStr + "T00:00:00Z");
    const d = new Date(dateStr + "T00:00:00Z");
    const diffDays = Math.floor((+d - +anchor) / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks % 2 !== 0) return false;
  }
  return true;
}

// ==== route ====
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const { cs, month } = (await req.json()) as { cs?: string; month?: string };
    if (!cs || !month) {
      console.log("[weekly/preview] 400 missing params", { cs, month });
      return NextResponse.json({ error: "cs and month are required" }, { status: 400 });
    }

    const { start, end, days } = monthStartEnd(month);
    console.log("[weekly/preview] params", { cs, month, start, end, daysCount: days.length });

    const supabase = supabaseAdmin;

    // 1) テンプレ一覧（view） ※月では絞らない / 有効期間 + active で後段 filter
    const { data: tRows, error: tErr } = await supabase
      .from("shift_weekly_template_view")
      .select("*")
      .eq("kaipoke_cs_id", cs)
      .eq("active", true);

    if (tErr) {
      console.error("[weekly/preview] template fetch error", tErr);
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
    const templates = (tRows ?? []) as ShiftWeeklyTemplate[];
    const filtered = templates.filter((t) => isWithinEffectiveRange(t, start, end));
    console.log("[weekly/preview] template counts", {
      total: templates.length,
      afterEffectiveRange: filtered.length,
    });

    // 2) 既存シフト（衝突判定用）
    const { data: existing, error: sErr } = await supabase
      .from("shift")
      .select("kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time")
      .eq("kaipoke_cs_id", cs)
      .gte("shift_start_date", start)
      .lte("shift_start_date", end);

    if (sErr) {
      console.error("[weekly/preview] existing fetch error", sErr);
      return NextResponse.json({ error: sErr.message }, { status: 500 });
    }
    console.log("[weekly/preview] existing count", existing?.length ?? 0);

    const byDate = new Map<
      string,
      { shift_start_time: string; shift_end_time: string }[]
    >();
    (existing ?? []).forEach((r) => {
      const list = byDate.get(r.shift_start_date) ?? [];
      list.push({ shift_start_time: r.shift_start_time, shift_end_time: r.shift_end_time });
      byDate.set(r.shift_start_date, list);
    });

    // 3) 展開
    const items = days.flatMap((dateStr) => {
      const w = weekdayOf(dateStr);
      return filtered
        .filter((t) => t.weekday === w && passesRecurrence(t, dateStr))
        .map((t) => {
          const dayShifts = byDate.get(dateStr) ?? [];
          const conflictCount = dayShifts.filter((s) =>
            overlaps(t.start_time, t.end_time, s.shift_start_time, s.shift_end_time)
          ).length;

          return {
            date: dateStr,
            weekday: w,
            start_time: t.start_time,
            end_time: t.end_time,
            service_code: t.service_code,
            required_staff_count: t.required_staff_count,
            two_person_work_flg: t.two_person_work_flg,
            judo_ido: t.judo_ido,
            staff_01_user_id: t.staff_01_user_id,
            staff_02_user_id: t.staff_02_user_id,
            staff_03_user_id: t.staff_03_user_id,
            staff_02_attend_flg: t.staff_02_attend_flg,
            staff_03_attend_flg: t.staff_03_attend_flg,
            staff_01_role_code: t.staff_01_role_code,
            staff_02_role_code: t.staff_02_role_code,
            staff_03_role_code: t.staff_03_role_code,
            template_id: t.template_id,
            conflict: conflictCount > 0,
            conflict_count: conflictCount,
          };
        });
    });

    console.log("[weekly/preview] result count", items.length, { sample: items[0] });
    const tookMs = Date.now() - startedAt;

    return NextResponse.json(items, {
      status: 200,
      headers: {
        "x-debug": `templates=${templates.length};filtered=${filtered.length};existing=${existing?.length ?? 0};took=${tookMs}ms`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[weekly/preview] 500", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
