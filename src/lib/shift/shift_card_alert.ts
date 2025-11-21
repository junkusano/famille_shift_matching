// src/lib/shift/shift_card_alert.ts
import { supabase } from "@/lib/supabaseClient";

/**
 * 時間調整アラート作成に必要な最小限のシフト情報
 */
export type ShiftLikeForAlert = {
    shift_id: number | string;
    kaipoke_cs_id: string | null;
    shift_start_date: string;          // 'YYYY-MM-DD'
    shift_start_time?: string | null;  // 'HH:MM:SS' など
    client_name?: string | null;
};

/**
 * cs_kaipoke_info テーブルで利用する行型
 */
type CsKaipokeInfoRow = {
    name: string | null;
};

/** 'HH:MM:SS' -> 'HH:MM' */
const toHM = (t?: string | null): string => (t ? t.slice(0, 5) : "");

/**
 * cs_kaipoke_info.name を優先して利用者名を解決する。
 * 取得できない場合は shift.client_name、最後の最後は「（利用者名非該当）」。
 */
async function resolveClientName(shift: ShiftLikeForAlert): Promise<string> {
    const csId = shift.kaipoke_cs_id ?? undefined;

    // 1) cs_kaipoke_info から取得トライ
    if (csId) {
        const { data, error } = await supabase
            .from("cs_kaipoke_info")
            .select("name")
            .eq("kaipoke_cs_id", csId)
            .maybeSingle();

        if (!error && data && typeof data.name === "string") {
            const name = data.name.trim();
            if (name) return name;
        }
    }

    // 2) シフトに載っている client_name をフォールバック
    const fallback = (shift.client_name ?? "").trim();
    if (fallback) return fallback;

    // 3) それでも無ければダミー
    return "（利用者名非該当）";
}

/**
 * シフト希望（時間調整含む）に紐づく alert_log を1件追加する。
 * - メッセージ先頭の「●●様」を cs_kaipoke_info.name ベースに統一
 * - timeAdjustNote の中には資格疑義の警告なども含まれていて OK（そのまま追記）
 */
export async function createTimeAdjustAlertFromShift(
    shift: ShiftLikeForAlert,
    timeAdjustNote?: string | null
): Promise<void> {
    const clientName = await resolveClientName(shift);
    const note = (timeAdjustNote ?? "").trim() || undefined;

    const message =
        `${clientName} 様 ${shift.shift_start_date} ${toHM(shift.shift_start_time)}～ のサービス時間調整の依頼が来ています。` +
        `マネジャーは利用者様調整とシフト変更をお願いします。` +
        (note ? `\n希望の時間調整: ${note}` : "");

    await supabase.from("alert_log").insert({
        message,
        visible_roles: ["manager", "staff"],
        severity: 2,
        status: "open",
        status_source: "system",
        kaipoke_cs_id: shift.kaipoke_cs_id,
        shift_id: shift.shift_id,
    });
}
