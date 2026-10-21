import { supabaseAdmin } from "@/lib/supabase/service";
import { isMeetingMonthEligible } from "@/lib/monthlyMeeting/eligibility";
import {
  getFirstStaffShiftDate,
  hasStaffShiftInMonth,
  isMeetingMonthOnOrAfterFirstShift,
} from "@/lib/monthlyMeeting/shiftEligibility";

// 月例会議は当月のシフトや所属の meeting_must に依存せず、在籍職員を対象にする。
// これにより、新しく職員登録された人も当月ページを開いた時点で自動追加される。
const FORCE_MONTHLY_MEETING_USER_IDS = ["shinomasuda", "satominishio", "taigamisu"];

export async function getMonthlyMeetingStaffIds(targetYm?: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id,status,entry_date_original,entry_date_latest")
    .limit(100000);

  if (error) throw error;

  const activeRows = (data ?? [])
    .filter((row) => !String(row.status ?? "").toLowerCase().startsWith("removed"))
  const activeIds: string[] = [];
  for (const row of activeRows) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    const hasEntryDate = Boolean(
      String(row.entry_date_latest || row.entry_date_original || "").trim(),
    );
    if (hasEntryDate) {
      if (isMeetingMonthEligible(row.entry_date_original, row.entry_date_latest, targetYm)) {
        activeIds.push(userId);
      }
    } else if (targetYm && await hasStaffShiftInMonth(userId, targetYm)) {
      const firstShiftDate = await getFirstStaffShiftDate(userId);
      if (isMeetingMonthOnOrAfterFirstShift(firstShiftDate, targetYm)) {
        activeIds.push(userId);
      }
    }
  }

  return Array.from(new Set([...activeIds, ...FORCE_MONTHLY_MEETING_USER_IDS]));
}
