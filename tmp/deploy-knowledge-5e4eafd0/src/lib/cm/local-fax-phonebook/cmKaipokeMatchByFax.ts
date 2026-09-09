// =============================================================
// src/lib/cm/local-fax-phonebook/cmKaipokeMatchByFax.ts
// FAX番号によるカイポケ事業所マッチング（共通ロジック）
//
// actions.ts と getLocalFaxPhonebook.ts の両方から使用される
// =============================================================

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import { normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";
import type { CmKaipokeOfficeInfo } from "@/types/cm/localFaxPhonebook";

const logger = createLogger("lib/cm/local-fax-phonebook/cmKaipokeMatchByFax");

// =============================================================
// カイポケ事業所のFAX情報キャッシュ用（リクエスト単位）
// =============================================================

type KaipokeOfficeRow = {
  id: number;
  office_name: string;
  service_type: string | null;
  office_number: string | null;
  fax: string | null;
  fax_proxy: string | null;
};

/**
 * カイポケ他社事業所のFAX番号付きデータを取得する
 */
async function fetchKaipokeOfficesWithFax(): Promise<KaipokeOfficeRow[]> {
  const { data, error } = await supabaseAdmin
    .from("cm_kaipoke_other_office")
    .select("id, office_name, service_type, office_number, fax, fax_proxy")
    .not("fax", "is", null);

  if (error) {
    logger.error("カイポケ事業所取得エラー", error);
    return [];
  }

  return data || [];
}

/**
 * 事業所のFAX番号（fax / fax_proxy）と対象FAX番号を比較する
 */
function matchesFaxNumber(office: KaipokeOfficeRow, normalizedFax: string): boolean {
  const officeFax = office.fax ? normalizeFaxNumber(office.fax) : null;
  const officeProxy = office.fax_proxy ? normalizeFaxNumber(office.fax_proxy) : null;

  return (
    (officeFax !== null && officeFax === normalizedFax) ||
    (officeProxy !== null && officeProxy === normalizedFax)
  );
}

/**
 * 事業所行を CmKaipokeOfficeInfo に変換する
 */
function toOfficeInfo(office: KaipokeOfficeRow): CmKaipokeOfficeInfo {
  return {
    id: office.id,
    office_name: office.office_name,
    service_type: office.service_type,
    office_number: office.office_number,
  };
}

// =============================================================
// 公開API
// =============================================================

/**
 * 1つのFAX番号に対してマッチするカイポケ事業所を返す
 * （actions.ts の checkKaipokeByFaxNumber から使用）
 */
export async function cmFindKaipokeOfficesByFax(
  faxNumber: string,
): Promise<CmKaipokeOfficeInfo[]> {
  const normalizedFax = normalizeFaxNumber(faxNumber);

  if (!normalizedFax || normalizedFax.length < 4) {
    return [];
  }

  const offices = await fetchKaipokeOfficesWithFax();

  return offices
    .filter((office) => matchesFaxNumber(office, normalizedFax))
    .map(toOfficeInfo);
}

/**
 * 複数のFAX番号（正規化済み）に対して、マッチするカイポケ事業所を
 * FAX番号ごとにグルーピングして返す
 * （getLocalFaxPhonebook.ts から使用）
 */
export async function cmFindKaipokeOfficesByFaxBatch(
  faxNumbersNormalized: string[],
): Promise<Map<string, CmKaipokeOfficeInfo[]>> {
  const result = new Map<string, CmKaipokeOfficeInfo[]>();

  if (faxNumbersNormalized.length === 0) {
    return result;
  }

  const offices = await fetchKaipokeOfficesWithFax();

  for (const office of offices) {
    for (const targetFax of faxNumbersNormalized) {
      if (matchesFaxNumber(office, targetFax)) {
        if (!result.has(targetFax)) {
          result.set(targetFax, []);
        }
        result.get(targetFax)!.push(toOfficeInfo(office));
      }
    }
  }

  return result;
}