// =============================================================
// src/lib/cm/contracts/actions.ts
// 契約関連 Server Actions（Client Componentから呼び出し可能）
//
// セキュリティ:
//   全アクションで requireCmSession(token) による認証を必須実施。
//   - クライアントから渡された access_token を検証（認証）
//   - 操作ログにユーザーIDを記録（監査証跡）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import type {
  CmVerificationMethod,
  CmVerificationDocument,
} from "@/types/cm/contract";

const logger = createLogger("lib/cm/contracts/actions");

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// =============================================================
// 同意登録
// =============================================================

export type CreateConsentParams = {
  kaipoke_cs_id: string;
  consent_electronic: boolean;
  consent_recording: boolean;
  signer_type: "self" | "proxy";
  proxy_name?: string;
  proxy_relationship?: string;
  proxy_reason?: string;
  signature_image_base64?: string;
  staff_id: string;
  ip_address?: string;
  user_agent?: string;
};

export async function createConsent(
  params: CreateConsentParams,
  token: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const auth = await requireCmSession(token);

    const {
      kaipoke_cs_id,
      consent_electronic,
      consent_recording,
      signer_type,
      proxy_name,
      proxy_relationship,
      proxy_reason,
      staff_id,
      ip_address,
      user_agent,
    } = params;

    // バリデーション
    if (!kaipoke_cs_id || !signer_type || !staff_id) {
      return { ok: false, error: "必須項目が不足しています" };
    }

    if (signer_type === "proxy" && !proxy_name) {
      return { ok: false, error: "代理人氏名は必須です" };
    }

    logger.info("同意登録開始", {
      kaipokeCsId: kaipoke_cs_id,
      signerType: signer_type,
      userId: auth.userId,
    });

    // TODO: Google Drive API 連携実装時に署名画像アップロードを有効化
    const gdriveFileId: string | null = null;
    const gdriveFileUrl: string | null = null;
    const gdriveFilePath: string | null = null;

    const { data, error } = await supabaseAdmin
      .from("cm_contract_consents")
      .insert({
        kaipoke_cs_id,
        consent_electronic: consent_electronic ?? false,
        consent_recording: consent_recording ?? false,
        signer_type,
        proxy_name: signer_type === "proxy" ? proxy_name : null,
        proxy_relationship: signer_type === "proxy" ? proxy_relationship : null,
        proxy_reason: signer_type === "proxy" ? proxy_reason : null,
        gdrive_file_id: gdriveFileId,
        gdrive_file_url: gdriveFileUrl,
        gdrive_file_path: gdriveFilePath,
        staff_id,
        ip_address: ip_address ?? null,
        user_agent: user_agent ?? null,
      })
      .select("id")
      .single();

    if (error) {
      logger.error("同意登録エラー", { message: error.message });
      return { ok: false, error: "同意登録に失敗しました" };
    }

    logger.info("同意登録完了", { consentId: data.id, userId: auth.userId });
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 契約更新（ステータス変更、本人確認情報入力、録音紐付け等）
// =============================================================

export type UpdateContractParams = {
  contractId: string;
  status?: string;
  signing_method?: string;
  contract_date?: string;
  consent_record_id?: string;
  verification_method_id?: string;
  verification_document_id?: string;
  verification_document_other?: string | null;
  verification_at?: string;
  plaud_recording_id?: number | null;
  notes?: string | null;
  signed_at?: string;
  completed_at?: string;
};

export async function updateContract(
  params: UpdateContractParams,
  token: string,
): Promise<ActionResult> {
  try {
    const auth = await requireCmSession(token);

    const { contractId, ...fields } = params;

    logger.info("契約更新開始", { contractId, fields: Object.keys(fields), userId: auth.userId });

    // 更新可能なフィールドのみ抽出
    const allowedFields = [
      "status",
      "signing_method",
      "contract_date",
      "consent_record_id",
      "verification_method_id",
      "verification_document_id",
      "verification_document_other",
      "verification_at",
      "plaud_recording_id",
      "notes",
      "signed_at",
      "completed_at",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in fields) {
        updateData[key] = fields[key as keyof typeof fields];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { ok: false, error: "更新するフィールドがありません" };
    }

    const { error } = await supabaseAdmin
      .from("cm_contracts")
      .update(updateData)
      .eq("id", contractId);

    if (error) {
      logger.error("契約更新エラー", { message: error.message });
      return { ok: false, error: "契約更新に失敗しました" };
    }

    logger.info("契約更新完了", { contractId, userId: auth.userId });
    return { ok: true };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 本人確認方法マスタ取得
// =============================================================

export async function getVerificationMethods(
  token: string,
): Promise<ActionResult<CmVerificationMethod[]>> {
  try {
    await requireCmSession(token);

    const { data, error } = await supabaseAdmin
      .from("cm_contract_verification_methods")
      .select("id, code, name, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error("本人確認方法マスタ取得エラー", { message: error.message });
      return { ok: false, error: "マスタデータの取得に失敗しました" };
    }

    return { ok: true, data: (data ?? []) as CmVerificationMethod[] };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}

// =============================================================
// 本人確認書類マスタ取得
// =============================================================

export async function getVerificationDocuments(
  token: string,
): Promise<ActionResult<CmVerificationDocument[]>> {
  try {
    await requireCmSession(token);

    const { data, error } = await supabaseAdmin
      .from("cm_contract_verification_documents")
      .select("id, code, name, description")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error("本人確認書類マスタ取得エラー", { message: error.message });
      return { ok: false, error: "マスタデータの取得に失敗しました" };
    }

    return { ok: true, data: (data ?? []) as CmVerificationDocument[] };
  } catch (e) {
    if (e instanceof CmAuthError) {
      return { ok: false, error: e.message };
    }
    logger.error("予期せぬエラー", e as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}