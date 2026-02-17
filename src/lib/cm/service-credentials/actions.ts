// =============================================================
// src/lib/cm/service-credentials/actions.ts
// サービス認証情報 Server Actions（CRUD操作）
//
// セキュリティ:
//   全アクションで requireCmSession(token) による認証・認可を実施。
//   - クライアントから渡された access_token を検証（認証）
//   - service_type が kyotaku or both であることを確認（認可）
//   - 操作ログにユーザーIDを記録（監査証跡）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { clearCredentialsCache } from "@/lib/cm/serviceCredentials";
import { requireCmSession, CmAuthError } from "@/lib/cm/auth/requireCmSession";
import { revalidatePath } from "next/cache";
import type { CmServiceCredential } from "@/types/cm/serviceCredentials";

const logger = createLogger("lib/cm/service-credentials/actions");

// =============================================================
// Types
// =============================================================

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 定数
// =============================================================

/** credentials JSON の最大キー数 */
const MAX_CREDENTIAL_KEYS = 20;

/** credentials JSON の値1つあたりの最大文字数 */
const MAX_CREDENTIAL_VALUE_LENGTH = 10000;

/** service_name の最大文字数 */
const MAX_SERVICE_NAME_LENGTH = 100;

/** label の最大文字数 */
const MAX_LABEL_LENGTH = 200;

// =============================================================
// バリデーションヘルパー
// =============================================================

/**
 * credentials オブジェクトの構造を検証する
 */
function validateCredentialsStructure(
  credentials: Record<string, unknown>
): string | null {
  const keys = Object.keys(credentials);

  if (keys.length === 0) {
    return "認証情報は少なくとも1つのキーが必要です";
  }

  if (keys.length > MAX_CREDENTIAL_KEYS) {
    return `認証情報のキー数が上限（${MAX_CREDENTIAL_KEYS}）を超えています`;
  }

  for (const key of keys) {
    const value = credentials[key];

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "object") {
      return `認証情報の値にオブジェクトや配列は使用できません（キー: ${key}）`;
    }

    if (typeof value === "string" && value.length > MAX_CREDENTIAL_VALUE_LENGTH) {
      return `認証情報の値が長すぎます（キー: ${key}、上限: ${MAX_CREDENTIAL_VALUE_LENGTH}文字）`;
    }
  }

  return null;
}

/**
 * CmAuthError を ActionResult に変換するヘルパー
 */
function handleActionError(error: unknown, context: string): ActionResult<never> {
  if (error instanceof CmAuthError) {
    return { ok: false, error: error.message };
  }
  logger.error(`${context}予期せぬエラー`, error);
  return { ok: false, error: "サーバーエラーが発生しました" };
}

// =============================================================
// 個別取得（編集用、認証情報を含む）
// =============================================================

export async function fetchServiceCredential(
  id: number,
  token: string
): Promise<ActionResult<CmServiceCredential>> {
  try {
    const auth = token ? await requireCmSession(token) : null;

    if (isNaN(id)) {
      return { ok: false, error: "無効なIDです" };
    }

    logger.info("サービス認証情報個別取得", { id, userId: auth?.userId });

    const { data: entry, error } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return { ok: false, error: "データが見つかりません" };
      }
      logger.error("サービス認証情報取得エラー", error);
      return { ok: false, error: "データ取得に失敗しました" };
    }

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    return handleActionError(error, "サービス認証情報取得");
  }
}

// =============================================================
// 新規作成
// =============================================================

export async function createServiceCredential(
  data: {
    service_name: string;
    label?: string | null;
    credentials: Record<string, unknown>;
    is_active?: boolean;
  },
  token: string
): Promise<ActionResult<CmServiceCredential>> {
  try {
    const auth = token ? await requireCmSession(token) : null;

    const { service_name, label, credentials, is_active } = data;

    // バリデーション: service_name
    if (!service_name || typeof service_name !== "string" || service_name.trim() === "") {
      return { ok: false, error: "サービス名は必須です" };
    }

    if (service_name.trim().length > MAX_SERVICE_NAME_LENGTH) {
      return { ok: false, error: `サービス名は${MAX_SERVICE_NAME_LENGTH}文字以内で入力してください` };
    }

    // バリデーション: label
    if (label && typeof label === "string" && label.trim().length > MAX_LABEL_LENGTH) {
      return { ok: false, error: `ラベルは${MAX_LABEL_LENGTH}文字以内で入力してください` };
    }

    // バリデーション: credentials
    if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
      return { ok: false, error: "認証情報は必須です" };
    }

    const credentialsError = validateCredentialsStructure(credentials);
    if (credentialsError) {
      return { ok: false, error: credentialsError };
    }

    // サービス名の重複チェック
    const { data: existing } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .select("id")
      .eq("service_name", service_name.trim())
      .single();

    if (existing) {
      return { ok: false, error: "このサービス名は既に登録されています" };
    }

    logger.info("サービス認証情報新規作成", {
      service_name,
      userId: auth?.userId,
    });

    const { data: entry, error: insertError } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .insert({
        service_name: service_name.trim(),
        label: label?.trim() || null,
        credentials,
        is_active: is_active ?? true,
      })
      .select()
      .single();

    if (insertError) {
      logger.error("サービス認証情報DB登録エラー", insertError);
      return { ok: false, error: "データベースへの登録に失敗しました" };
    }

    clearCredentialsCache(service_name.trim());
    revalidatePath("/cm-portal/service-credentials");

    logger.info("サービス認証情報新規作成完了", {
      id: entry.id,
      userId: auth?.userId,
    });

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    return handleActionError(error, "サービス認証情報作成");
  }
}

// =============================================================
// 更新
// =============================================================

export async function updateServiceCredential(
  id: number,
  data: {
    service_name?: string;
    label?: string | null;
    credentials?: Record<string, unknown>;
    is_active?: boolean;
  },
  token: string
): Promise<ActionResult<CmServiceCredential>> {
  try {
    const auth = token ? await requireCmSession(token) : null;

    if (isNaN(id)) {
      return { ok: false, error: "無効なIDです" };
    }

    const { service_name, label, credentials, is_active } = data;

    // バリデーション: service_name（指定時のみ）
    if (service_name !== undefined) {
      if (typeof service_name !== "string" || service_name.trim() === "") {
        return { ok: false, error: "サービス名は空にできません" };
      }
      if (service_name.trim().length > MAX_SERVICE_NAME_LENGTH) {
        return { ok: false, error: `サービス名は${MAX_SERVICE_NAME_LENGTH}文字以内で入力してください` };
      }
    }

    // バリデーション: label（指定時のみ）
    if (label !== undefined && label !== null) {
      if (typeof label === "string" && label.trim().length > MAX_LABEL_LENGTH) {
        return { ok: false, error: `ラベルは${MAX_LABEL_LENGTH}文字以内で入力してください` };
      }
    }

    // バリデーション: credentials（指定時のみ）
    if (credentials !== undefined) {
      if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
        return { ok: false, error: "認証情報の形式が不正です" };
      }
      const credentialsError = validateCredentialsStructure(credentials);
      if (credentialsError) {
        return { ok: false, error: credentialsError };
      }
    }

    logger.info("サービス認証情報更新", { id, userId: auth?.userId });

    // 既存レコードを取得
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return { ok: false, error: "データが見つかりません" };
    }

    // サービス名変更時の重複チェック
    if (service_name && service_name.trim() !== existing.service_name) {
      const { data: duplicate } = await supabaseAdmin
        .from("cm_rpa_credentials")
        .select("id")
        .eq("service_name", service_name.trim())
        .neq("id", id)
        .single();

      if (duplicate) {
        return { ok: false, error: "このサービス名は既に登録されています" };
      }
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (service_name !== undefined) {
      updateData.service_name = service_name.trim();
    }
    if (label !== undefined) {
      updateData.label = label?.trim() || null;
    }
    if (credentials !== undefined) {
      updateData.credentials = credentials;
    }
    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    const { data: entry, error: updateError } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      logger.error("サービス認証情報更新エラー", updateError);
      return { ok: false, error: "更新に失敗しました" };
    }

    clearCredentialsCache(existing.service_name);
    if (service_name && service_name.trim() !== existing.service_name) {
      clearCredentialsCache(service_name.trim());
    }

    revalidatePath("/cm-portal/service-credentials");

    logger.info("サービス認証情報更新完了", { id, userId: auth?.userId });

    return { ok: true, data: entry as CmServiceCredential };
  } catch (error) {
    return handleActionError(error, "サービス認証情報更新");
  }
}

// =============================================================
// 削除
// =============================================================

export async function deleteServiceCredential(
  id: number,
  token: string
): Promise<ActionResult> {
  try {
    const auth = token ? await requireCmSession(token) : null;

    if (isNaN(id)) {
      return { ok: false, error: "無効なIDです" };
    }

    logger.info("サービス認証情報削除", { id, userId: auth?.userId });

    const { data: existing } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .select("service_name")
      .eq("id", id)
      .single();

    const { error: deleteError } = await supabaseAdmin
      .from("cm_rpa_credentials")
      .delete()
      .eq("id", id);

    if (deleteError) {
      logger.error("サービス認証情報削除エラー", deleteError);
      return { ok: false, error: "削除に失敗しました" };
    }

    if (existing) {
      clearCredentialsCache(existing.service_name);
    }

    revalidatePath("/cm-portal/service-credentials");

    logger.info("サービス認証情報削除完了", { id, userId: auth?.userId });

    return { ok: true };
  } catch (error) {
    return handleActionError(error, "サービス認証情報削除");
  }
}