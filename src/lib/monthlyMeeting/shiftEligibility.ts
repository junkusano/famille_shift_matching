import { supabaseAdmin } from "@/lib/supabase/service";

function nextMonthStart(targetYm: string): string {
  const [year, month] = targetYm.split("-").map(Number);
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

/** 対象月に本人が1件以上配置された勤務シフトがあるかを確認する。 */
export async function hasStaffShiftInMonth(
  userId: string,
  targetYm: string,
): Promise<boolean> {
  const monthStart = `${targetYm}-01`;
  const nextStart = nextMonthStart(targetYm);
  const { data, error } = await supabaseAdmin
    .from("shift")
    .select("shift_id")
    .gte("shift_start_date", monthStart)
    .lt("shift_start_date", nextStart)
    .or(
      `staff_01_user_id.eq.${userId},staff_02_user_id.eq.${userId},staff_03_user_id.eq.${userId}`,
    )
    .limit(1);

  if (error) throw new Error(`shift select failed: ${error.message}`);
  return (data ?? []).length > 0;
}

