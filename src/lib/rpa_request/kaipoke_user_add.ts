// src/lib/rpa_request/kaipoke_user_add.ts
//
// カイポケユーザー追加用 RPA リクエスト共通ロジック

import hepburn from "hepburn";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * rpa_command_requests.request_details に入るペイロード
 */
export type KaipokeUserRequestDetails = {
    user_id: string;
    last_name: string;
    last_name_kana: string;
    first_name: string;
    first_name_kana: string;
    gender: string | null;
    employment_type: string;
    org_unit: string;
    password: string;
};

export type BuildKaipokeUserParams = {
    /**
     * users.user_id （テキスト）
     */
    userId: string;

    lastNameKanji: string;
    /**
     * 画面表示用の姓カナ（エリア prefix 済みなど）
     */
    lastNameKana: string;

    firstNameKanji: string;
    /**
     * カタカナに正規化済み想定
     */
    firstNameKana: string;

    gender: string | null;
    employmentTypeName: string;
    orgUnitName: string;

    /**
     * パスワードの元になるかな文字列（姓のみ・prefix 無し）。
     * 省略時は lastNameKana をそのまま使う。
     */
    passwordSourceKana?: string;

    /**
     * すでに計算済みのパスワードを渡したい場合はここに指定。
     * 省略時は passwordSourceKana / lastNameKana から自動生成する。
     */
    passwordOverride?: string;
};

/**
 * ヘボン式ローマ字から 10 桁のパスワードを生成
 *  - 先頭のみ大文字
 *  - 足りない分は 0 で埋める
 *  - 長すぎる場合は 10 桁に切り詰め
 */
export function buildKaipokePasswordFromKana(sourceKana: string): string {
    let lastNameHebon = hepburn.fromKana(sourceKana || "").toLowerCase();
    if (!lastNameHebon) {
        lastNameHebon = "User";
    }

    lastNameHebon =
        lastNameHebon.charAt(0).toUpperCase() + lastNameHebon.slice(1);

    let password = lastNameHebon;
    if (password.length < 10) {
        password = password + "0".repeat(10 - password.length);
    } else if (password.length > 10) {
        password = password.slice(0, 10);
    }

    return password;
}

/**
 * RPA に渡す request_details を組み立てる（純粋関数）
 */
export function buildKaipokeUserRequestDetails(
    params: BuildKaipokeUserParams,
): KaipokeUserRequestDetails {
    const {
        userId,
        lastNameKanji,
        lastNameKana,
        firstNameKanji,
        firstNameKana,
        gender,
        employmentTypeName,
        orgUnitName,
        passwordSourceKana,
        passwordOverride,
    } = params;

    const password =
        passwordOverride ??
        buildKaipokePasswordFromKana(passwordSourceKana ?? lastNameKana);

    return {
        user_id: userId,
        last_name: lastNameKanji,
        last_name_kana: lastNameKana,
        first_name: firstNameKanji,
        first_name_kana: firstNameKana,
        gender: gender ?? null,
        employment_type: employmentTypeName,
        org_unit: orgUnitName,
        password,
    };
}

export type InsertKaipokeUserRpaRequestParams = {
    supabase: SupabaseClient;
    templateId: string;
    requesterId: string;
    approverId?: string;
    requestDetails: KaipokeUserRequestDetails;
};

export type InsertKaipokeUserRpaRequestResult =
    | { ok: true }
    | { ok: false; error: string };

/**
 * rpa_command_requests への insert 共通処理
 */
export async function insertKaipokeUserRpaRequest(
    params: InsertKaipokeUserRpaRequestParams,
): Promise<InsertKaipokeUserRpaRequestResult> {
    const { supabase, templateId, requesterId, approverId, requestDetails } =
        params;

    const { error } = await supabase.from("rpa_command_requests").insert({
        template_id: templateId,
        requester_id: requesterId,
        approver_id: approverId ?? requesterId,
        status: "approved",
        request_details: requestDetails,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    return { ok: true };
}
