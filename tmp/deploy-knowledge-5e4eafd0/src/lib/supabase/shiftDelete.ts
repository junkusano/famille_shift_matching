// src/lib/supabase/shiftDelete.ts

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/**
 * AI応答から抽出されたシフト削除のリクエスト詳細の型
 */
type DeletionDetail = {
    shift_date: string; // "YYYY-MM-DD"
    shift_time: string; // "HH:MM-HH:MM"
};

type ShiftDeleteRequest = {
    group_account: string; // 介護保険サービス利用者ID (kaipoke_cs_idとして使用)
    deletions: DeletionDetail[];
};

/**
 * シフト削除リクエストに基づいて、shiftテーブルからレコードを削除します。
 * @param request シフト削除リクエストデータ
 * @returns 処理結果のPromise
 */
export async function deleteShifts(request: ShiftDeleteRequest): Promise<{ success: boolean; errors: string[] }> {
    const { group_account, deletions } = request;
    const errors: string[] = [];

    if (!group_account || group_account === "不明") {
        errors.push("group_accountが不明です。シフト削除はできません。");
        return { success: false, errors };
    }

    // group_accountは、shiftテーブルの kaipoke_cs_id に対応
    const kaipoke_cs_id = group_account;

    for (const del of deletions) {
        // 必須項目チェック
        if (del.shift_date === "不明" || del.shift_time === "不明") {
            errors.push(
                `必須情報不足: 日付:${del.shift_date}, 時間:${del.shift_time}`
            );
            continue;
        }

        const [startTimeStr] = del.shift_time.split("-");

        // shiftテーブルのユニーク制約 (unique_kaipoke_cs_id_shift_datetime) に基づいてレコードを特定
        try {
            const { error: deleteError, count } = await supabase
                .from("shift")
                .delete({ count: 'exact' }) // 削除されたレコード数を取得
                .eq("kaipoke_cs_id", kaipoke_cs_id)
                .eq("shift_start_date", del.shift_date)
                .eq("shift_start_time", startTimeStr); // 'HH:MM' 形式

            if (deleteError) {
                console.error("❌ Shift deletion failed for:", { kaipoke_cs_id, ...del }, "Error:", deleteError.message);
                errors.push(
                    `シフト削除失敗 (利用者:${kaipoke_cs_id}, 日付:${del.shift_date}, 時間:${del.shift_time}): ${deleteError.message}`
                );
            } else if (count === 0) {
                console.warn("⚠️ Shift not found for deletion:", { kaipoke_cs_id, ...del });
                errors.push(
                    `シフト削除警告 (利用者:${kaipoke_cs_id}, 日付:${del.shift_date}, 時間:${del.shift_time}): 対象シフトが見つかりませんでした。`
                );
            } else {
                console.log(`✅ Shift deleted successfully (Count: ${count}):`, { kaipoke_cs_id, ...del });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("💥 Unexpected DB error during shift delete:", msg);
            errors.push(`予期せぬエラー (利用者:${kaipoke_cs_id}, 日付:${del.shift_date}, 時間:${del.shift_time}): ${msg}`);
        }
    }

    return { success: errors.length === 0, errors };
}