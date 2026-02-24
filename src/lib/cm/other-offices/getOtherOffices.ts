// =============================================================
// src/lib/cm/other-offices/getOtherOffices.ts
// 他社事業所一覧取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { buildFaxSearchPattern, normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";
import { cmSanitizeForLikeValue } from "@/lib/cm/supabase/sanitizeFilterValue";
import type {
  CmOtherOffice,
  CmOtherOfficePagination,
} from "@/types/cm/otherOffices";

const logger = createLogger("lib/cm/other-offices");

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

// =============================================================
// Types
// =============================================================

export type GetOtherOfficesParams = {
  page?: number;
  limit?: number;
  serviceType?: string;
  officeName?: string;
  officeNumber?: string;
  faxNumber?: string;
};

export type GetOtherOfficesResult = {
  ok: true;
  offices: CmOtherOffice[];
  serviceTypes: string[];
  pagination: CmOtherOfficePagination;
} | {
  ok: false;
  error: string;
};

// =============================================================
// 一覧取得
// =============================================================

export async function getOtherOffices(
  params: GetOtherOfficesParams = {}
): Promise<GetOtherOfficesResult> {
  const {
    page = 1,
    limit = DEFAULT_LIMIT,
    serviceType = "",
    officeName = "",
    officeNumber = "",
    faxNumber = "",
  } = params;

  // パラメータの正規化
  const normalizedPage = Math.max(1, page);
  const normalizedLimit = Math.min(100, Math.max(1, limit));

  try {
    logger.info("他社事業所検索", { officeName, faxNumber, serviceType });

    // ベースクエリ
    let query = supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("*", { count: "exact" });

    // フィルター適用
    if (serviceType) {
      query = query.eq("service_type", serviceType);
    }
    if (officeName) {
      // LIKE ワイルドカード文字をサニタイズ
      const sanitizedName = cmSanitizeForLikeValue(officeName);
      if (sanitizedName) {
        query = query.ilike("office_name", `%${sanitizedName}%`);
      }
    }
    if (officeNumber) {
      // LIKE ワイルドカード文字をサニタイズ
      const sanitizedNumber = cmSanitizeForLikeValue(officeNumber);
      if (sanitizedNumber) {
        query = query.ilike("office_number", `%${sanitizedNumber}%`);
      }
    }

    // FAX番号検索（ハイフン混在対応）
    if (faxNumber) {
      // 入力を正規化（数字のみに）
      const normalized = normalizeFaxNumber(faxNumber);

      if (normalized && normalized.length >= 4) {
        // ワイルドカードパターンを生成
        const wildcardPattern = buildFaxSearchPattern(normalized);

        if (wildcardPattern) {
          // buildFaxSearchPattern は数字のみの入力からパターンを生成するため
          // PostgREST 特殊文字は含まれない（追加のサニタイズは不要）
          query = query.or(`fax.ilike.${wildcardPattern},fax_proxy.ilike.${wildcardPattern}`);
          logger.info("FAX検索パターン", { input: faxNumber, pattern: wildcardPattern });
        } else {
          // 短すぎる場合は部分一致（normalized は数字のみなのでサニタイズ不要）
          query = query.or(`fax.ilike.%${normalized}%,fax_proxy.ilike.%${normalized}%`);
        }
      } else if (normalized) {
        // 4桁未満の数字: そのまま部分一致（数字のみなのでサニタイズ不要）
        query = query.or(`fax.ilike.%${normalized}%,fax_proxy.ilike.%${normalized}%`);
      }
      // normalized が空（数字を含まない入力）の場合はフィルターを適用しない
    }

    // ソート（サービス種別 → 事業所名）
    query = query
      .order("service_type", { ascending: true, nullsFirst: false })
      .order("office_name", { ascending: true });

    // ページネーション
    const offset = (normalizedPage - 1) * normalizedLimit;
    query = query.range(offset, offset + normalizedLimit - 1);

    const { data: offices, count, error: queryError } = await query;

    if (queryError) {
      logger.error("他社事業所取得エラー", queryError);
      return { ok: false, error: "データ取得に失敗しました" };
    }

    // サービス種別の一覧を取得（フィルター用）
    const { data: serviceTypesData } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("service_type")
      .not("service_type", "is", null);

    const serviceTypes = [...new Set(
      (serviceTypesData || [])
        .map((d) => d.service_type)
        .filter((s): s is string => s !== null)
    )].sort();

    // ページネーション情報
    const total = count || 0;
    const totalPages = Math.ceil(total / normalizedLimit);

    logger.info("他社事業所取得完了", { count: offices?.length, total });

    return {
      ok: true,
      offices: (offices || []) as CmOtherOffice[],
      serviceTypes,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
        totalPages,
        hasNext: normalizedPage < totalPages,
        hasPrev: normalizedPage > 1,
      },
    };
  } catch (error) {
    logger.error("他社事業所取得予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}