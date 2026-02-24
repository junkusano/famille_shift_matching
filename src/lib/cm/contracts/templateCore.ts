// =============================================================
// src/lib/cm/contracts/templateCore.ts
// テンプレート内部処理（"use server" なし — ブラウザから直接呼び出し不可）
//
// PDF生成など、サーバーサイド内部でのみ使用する関数を配置する。
// 認証は呼び出し元の責務（core.ts パターン: コーディングルール §10-3）。
//
// ⚠️ このファイルに "use server" を付けないこと。
//    付けるとブラウザから直接呼び出し可能になり、
//    認証チェックのないDB操作がセキュリティホールになる。
// =============================================================

import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import type { CmContractTemplateCode } from "@/types/cm/contractTemplate";

const logger = createLogger("lib/cm/contracts/templateCore");

// =============================================================
// テンプレートHTML取得（PDF生成用 — 内部専用）
//
// 呼び出し元:
//   - generateContractPdf.ts（Server Actions 経由で認証済み）
//   - generateConsentPdf.ts（同上）
//
// 認証:
//   呼び出し元が requireCmSession(token) で認証済みであること。
//   この関数自体は認証を行わない（core.ts パターン）。
// =============================================================

export async function cmGetTemplateHtmlCore(
  code: CmContractTemplateCode,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("cm_contract_templates")
      .select("html_content")
      .eq("code", code)
      .eq("is_active", true)
      .single();

    if (error) {
      logger.error("テンプレートHTML取得エラー", { code, message: error.message });
      return null;
    }

    return data?.html_content ?? null;
  } catch (error) {
    logger.error("テンプレートHTML取得予期せぬエラー", { code, error });
    return null;
  }
}