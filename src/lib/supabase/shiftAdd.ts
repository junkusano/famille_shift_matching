// src/lib/supabase/shiftAdd.ts

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/**
 * AI応答から抽出されたシフト追加のリクエスト詳細の型
 */
type AdditionDetail = {
    shift_date: string; // "YYYY-MM-DD"
    shift_time: string; // "HH:MM-HH:MM"
    user_id: string | '不明'; // 担当者の lw_user_id
};

type ShiftAddRequest = {
    group_account: string; // 介護保険サービス利用者ID (kaipoke_cs_idとして使用)
    additions: AdditionDetail[];
};

/**
 * シフト追加リクエストに基づいて、shiftテーブルにレコードを挿入します。
 * @param request シフト追加リクエストデータ
 * @returns 処理結果のPromise
 */
export async function insertShifts(request: ShiftAddRequest): Promise<{ success: boolean; errors: string[] }> {
    const { group_account, additions } = request;
    const errors: string[] = [];

    if (!group_account || group_account === "不明") {
        errors.push("group_accountが不明です。シフト追加はできません。");
        return { success: false, errors };
    }

    // group_accountは、shiftテーブルの kaipoke_cs_id に対応します
    const kaipoke_cs_id = group_account;

    for (const add of additions) {
        // 必須項目チェック
        if (add.shift_date === "不明" || add.shift_time === "不明" || add.user_id === "不明") {
            errors.push(
                `必須情報不足: 日付:${add.shift_date}, 時間:${add.shift_time}, 担当者ID:${add.user_id}`
            );
            continue;
        }

        const [startTimeStr, endTimeStr] = add.shift_time.split("-");

        // shiftテーブルへの挿入データを作成
        const newShift = {
            kaipoke_cs_id: kaipoke_cs_id,
            shift_start_date: add.shift_date,
            shift_start_time: startTimeStr, // HH:MM
            shift_end_date: add.shift_date, // 終日サービスでない限り、開始日と同じ
            shift_end_time: endTimeStr,     // HH:MM
            staff_01_user_id: add.user_id, // 担当者をstaff_01として設定
            // service_code など、不明な項目は null またはデフォルト値に依存
            required_staff_count: 1,
            two_person_work_flg: false,
            // staff_01_role_code は '01' (Primary Staff) など適切な値が必要ですが、
            // 情報がないためここでは null にしておきます。
            // 既存の処理で role_code を特定するロジックがあればそれを適用してください。
        };

        try {
            // shiftテーブルに挿入
            const { error: insertError } = await supabase
                .from("shift")
                .insert([newShift])
                // 重複キー違反 (unique_kaipoke_cs_id_shift_datetime) はここでエラーとなります
                .select(); // 挿入成功を確認するため select() を追加

            if (insertError) {
                // 重複エラーの場合は 'already exists' として扱っても良いですが、ここでは詳細を記録
                console.error("❌ Shift insertion failed for:", newShift, "Error:", insertError.message);
                errors.push(
                    `シフト追加失敗 (利用者:${kaipoke_cs_id}, 日付:${add.shift_date}, 時間:${add.shift_time}): ${insertError.message}`
                );
            } else {
                console.log("✅ Shift added successfully:", newShift);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("💥 Unexpected DB error during shift insert:", msg);
            errors.push(`予期せぬエラー (利用者:${kaipoke_cs_id}, 日付:${add.shift_date}, 時間:${add.shift_time}): ${msg}`);
        }
    }

    return { success: errors.length === 0, errors };
}