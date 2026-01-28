// =============================================================
// src/lib/cm/local-fax-phonebook/getLocalFaxPhonebook.ts
// ローカルFAX電話帳 一覧取得（Server Component用）
// =============================================================

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";
import type {
  CmLocalFaxPhonebookPagination,
  CmKaipokeOfficeInfo,
  CmLocalFaxPhonebookEntryWithKaipoke,
} from "@/types/cm/localFaxPhonebook";

const logger = createLogger("lib/cm/local-fax-phonebook");

// 1ページあたりの件数
const DEFAULT_LIMIT = 50;

// =============================================================
// Types
// =============================================================

export type GetLocalFaxPhonebookParams = {
  page?: number;
  limit?: number;
  name?: string;
  faxNumber?: string;
  showInactive?: boolean;
};

export type GetLocalFaxPhonebookResult = {
  ok: true;
  entries: CmLocalFaxPhonebookEntryWithKaipoke[];
  pagination: CmLocalFaxPhonebookPagination;
} | {
  ok: false;
  error: string;
};

// =============================================================
// カイポケ登録情報を取得するヘルパー関数
// =============================================================

async function getKaipokeInfoByFaxNumbers(
  faxNumbersNormalized: string[]
): Promise<Map<string, CmKaipokeOfficeInfo[]>> {
  const result = new Map<string, CmKaipokeOfficeInfo[]>();

  if (faxNumbersNormalized.length === 0) {
    return result;
  }

  const { data: kaipokeOffices, error } = await supabaseAdmin
    .from("cm_kaipoke_other_office")
    .select("id, office_name, service_type, office_number, fax, fax_proxy")
    .not("fax", "is", null);

  if (error) {
    logger.error("カイポケ事業所取得エラー", error);
    return result;
  }

  // FAX番号ごとにマッチする事業所をグルーピング
  for (const office of kaipokeOffices || []) {
    const officeFaxNormalized = office.fax ? normalizeFaxNumber(office.fax) : null;
    const officeProxyNormalized = office.fax_proxy ? normalizeFaxNumber(office.fax_proxy) : null;

    for (const targetFax of faxNumbersNormalized) {
      if (
        (officeFaxNormalized && officeFaxNormalized === targetFax) ||
        (officeProxyNormalized && officeProxyNormalized === targetFax)
      ) {
        const info: CmKaipokeOfficeInfo = {
          id: office.id,
          office_name: office.office_name,
          service_type: office.service_type,
          office_number: office.office_number,
        };

        if (!result.has(targetFax)) {
          result.set(targetFax, []);
        }
        result.get(targetFax)!.push(info);
      }
    }
  }

  return result;
}

// =============================================================
// 一覧取得
// =============================================================

export async function getLocalFaxPhonebook(
  params: GetLocalFaxPhonebookParams = {}
): Promise<GetLocalFaxPhonebookResult> {
  const {
    page = 1,
    limit = DEFAULT_LIMIT,
    name = "",
    faxNumber = "",
    showInactive = false,
  } = params;

  const normalizedPage = Math.max(1, page);
  const normalizedLimit = Math.min(100, Math.max(1, limit));

  try {
    logger.info("ローカルFAX電話帳検索", { name, faxNumber, showInactive, page });

    // ベースクエリ
    let query = supabaseAdmin
      .from("cm_local_fax_phonebook")
      .select("*", { count: "exact" });

    // フィルター適用
    if (!showInactive) {
      query = query.eq("is_active", true);
    }

    if (name) {
      // 事業所名または読み仮名で部分一致検索
      query = query.or(`name.ilike.%${name}%,name_kana.ilike.%${name}%`);
    }

    if (faxNumber) {
      // FAX番号検索（正規化して比較）
      const normalized = normalizeFaxNumber(faxNumber);
      if (normalized) {
        query = query.or(`fax_number.ilike.%${faxNumber}%,fax_number_normalized.ilike.%${normalized}%`);
      } else {
        query = query.ilike("fax_number", `%${faxNumber}%`);
      }
    }

    // ソート（読み仮名 → 事業所名）
    query = query
      .order("name_kana", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    // ページネーション
    const offset = (normalizedPage - 1) * normalizedLimit;
    query = query.range(offset, offset + normalizedLimit - 1);

    const { data: entries, count, error: queryError } = await query;

    if (queryError) {
      logger.error("ローカルFAX電話帳取得エラー", queryError);
      return { ok: false, error: "データ取得に失敗しました" };
    }

    // カイポケ登録情報を取得
    const faxNumbersNormalized = (entries || [])
      .map((e) => e.fax_number_normalized)
      .filter((fax): fax is string => fax !== null && fax !== "");

    const kaipokeMap = await getKaipokeInfoByFaxNumbers(faxNumbersNormalized);

    // エントリにカイポケ情報を付加
    const entriesWithKaipoke: CmLocalFaxPhonebookEntryWithKaipoke[] = (entries || []).map((entry) => {
      const kaipokeInfo = entry.fax_number_normalized
        ? kaipokeMap.get(entry.fax_number_normalized) || []
        : [];
      return {
        ...entry,
        kaipoke_offices: kaipokeInfo,
      } as CmLocalFaxPhonebookEntryWithKaipoke;
    });

    // ページネーション情報
    const total = count || 0;
    const totalPages = Math.ceil(total / normalizedLimit);

    const pagination: CmLocalFaxPhonebookPagination = {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages,
      hasNext: normalizedPage < totalPages,
      hasPrev: normalizedPage > 1,
    };

    logger.info("ローカルFAX電話帳取得完了", { count: entries?.length, total });

    return {
      ok: true,
      entries: entriesWithKaipoke,
      pagination,
    };
  } catch (error) {
    logger.error("ローカルFAX電話帳取得予期せぬエラー", error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
