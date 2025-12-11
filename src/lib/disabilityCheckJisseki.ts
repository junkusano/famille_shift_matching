// src/lib/disabilityCheckJisseki.ts
import { supabaseAdmin } from "@/lib/supabase/service";

/**
 * 当月＋翌月分の disability_check.asigned_jisseki_staff を
 * cs_kaipoke_info を元にアップサートする処理
 *
 * @param baseDate 基準日（省略時は今日）
 */
export async function refreshDisabilityCheckJissekiStaff(baseDate?: Date): Promise<void> {
  const date = baseDate ?? new Date();
  const baseDateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

  const { error } = await supabaseAdmin.rpc("refresh_disability_check_jisseki_staff", {
    _base_date: baseDateStr,
  });

  if (error) {
    console.error("refreshDisabilityCheckJissekiStaff RPC error:", error);
    throw error;
  }
}
