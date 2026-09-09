import { supabaseAdmin } from "@/lib/supabase/service";

// 月例会議は当月のシフトや所属の meeting_must に依存せず、在籍職員を対象にする。
// これにより、新しく職員登録された人も当月ページを開いた時点で自動追加される。
const FORCE_MONTHLY_MEETING_USER_IDS = ["shinomasuda", "satominishio", "taigamisu"];

export async function getMonthlyMeetingStaffIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id,status")
    .limit(100000);

  if (error) throw error;

  const activeIds = (data ?? [])
    .filter((row) => !String(row.status ?? "").toLowerCase().startsWith("removed"))
    .map((row) => String(row.user_id ?? "").trim())
    .filter(Boolean);

  return Array.from(new Set([...activeIds, ...FORCE_MONTHLY_MEETING_USER_IDS]));
}
