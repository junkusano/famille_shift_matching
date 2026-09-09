export type JissekiMunicipalitySetting = {
  municipality: string;
  municipality_display_name: string;
  sort_order: number;
};

export type ResolvedJissekiMunicipality = {
  municipality: string;
  municipality_display_name: string;
  sort_order: number | null;
  source: "setting" | "address";
};

function normalizeLocation(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF　]+/g, "")
    .replace(/^〒?\d{3}-?\d{4}/, "")
    .trim();
}

export function findJissekiMunicipalitySetting(
  address: string | null | undefined,
  settings: readonly JissekiMunicipalitySetting[],
) {
  const normalizedAddress = normalizeLocation(address);
  if (!normalizedAddress) return null;

  return [...settings]
    .sort(
      (a, b) =>
        normalizeLocation(b.municipality).length -
        normalizeLocation(a.municipality).length,
    )
    .find((setting) => {
      const municipality = normalizeLocation(setting.municipality);
      const displayName = normalizeLocation(setting.municipality_display_name);
      return (
        (municipality.length > 0 && normalizedAddress.includes(municipality)) ||
        (displayName.length > 0 && normalizedAddress.includes(displayName))
      );
    }) ?? null;
}

/**
 * 自治体設定にない住所でも、住所文字列から印字用の市区町村名を補完する。
 * 政令市は区名ではなく市名（例: 名古屋市千種区 -> 名古屋）を採用する。
 */
export function inferJissekiMunicipalityFromAddress(
  address: string | null | undefined,
): Omit<ResolvedJissekiMunicipality, "sort_order" | "source"> | null {
  const normalized = normalizeLocation(address);
  if (!normalized) return null;

  const withoutPrefecture = normalized.replace(/^.{2,3}[都道府県]/, "");
  const designatedCity = withoutPrefecture.match(/^(.+?市).+?区/);
  const municipality =
    designatedCity?.[1] ??
    withoutPrefecture.match(/^(.+?(?:市|区|町|村))/)?.[1] ??
    null;

  if (!municipality) return null;

  return {
    municipality,
    municipality_display_name: municipality.replace(/[市区町村]$/, ""),
  };
}

export function resolveJissekiMunicipality(
  address: string | null | undefined,
  settings: readonly JissekiMunicipalitySetting[],
): ResolvedJissekiMunicipality | null {
  const setting = findJissekiMunicipalitySetting(address, settings);
  if (setting) {
    return {
      ...setting,
      source: "setting",
    };
  }

  const inferred = inferJissekiMunicipalityFromAddress(address);
  return inferred
    ? {
        ...inferred,
        sort_order: null,
        source: "address",
      }
    : null;
}
