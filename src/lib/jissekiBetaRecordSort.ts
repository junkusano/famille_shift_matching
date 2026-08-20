export type JissekiServiceCategory = "disability" | "mobility";

export type RecordSortClient = {
  municipality_display_name?: string | null;
  municipality_sort_order?: number | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
  kana?: string | null;
};

/** 紙の実績記録票を並べるための表示記号。 */
export function createJissekiRecordSortLabel(service: JissekiServiceCategory, client: RecordSortClient): string {
  const serviceLabel = service === "mobility" ? "移" : "障";
  const municipality = clean(client.municipality_display_name) || "未設定";
  const lastNameKana = toHiragana(getKanaParts(client).lastName);
  const lastNamePrefix = Array.from(lastNameKana).slice(0, 2).join("") || "未設定";
  return `${serviceLabel}_${municipality}_${lastNamePrefix}`;
}

/**
 * 既存の kana は正式なフル読みとして再利用する。
 * 半角・全角スペースで登録されている場合だけ苗字/名前に分け、区切りがない既存値は
 * 苗字側として扱う（漢字からの読み推測はしない）。
 */
export function getKanaParts(client: RecordSortClient): { lastName: string; firstName: string } {
  const explicitLastName = clean(client.last_name_kana);
  const explicitFirstName = clean(client.first_name_kana);
  if (explicitLastName || explicitFirstName) {
    return { lastName: explicitLastName, firstName: explicitFirstName };
  }

  const kanaParts = (client.kana ?? "").normalize("NFKC").trim().split(/[\s　]+/).filter(Boolean);
  return {
    lastName: clean(kanaParts[0]),
    firstName: clean(kanaParts.slice(1).join("")),
  };
}

export function jissekiServiceSortOrder(service: JissekiServiceCategory): number {
  return service === "mobility" ? 1 : 0;
}

export function toHiragana(value: string): string {
  return value.replace(/[\u30A1-\u30F6]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

function clean(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/[\s　]+/g, "").trim();
}
