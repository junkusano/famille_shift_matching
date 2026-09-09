import { NextRequest, NextResponse } from "next/server";

const POSTAL_HELPER_URL = "https://postal.japal.co.jp/v1/postal-codes";
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type PostalHelperResult = {
  zipcode?: unknown;
  pref?: unknown;
  city?: unknown;
  town?: unknown;
};

type GoogleAddressComponent = {
  long_name?: unknown;
  types?: unknown;
};

type GoogleGeocodingResult = {
  address_components?: unknown;
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function townLookupTerms(address: string): string[] {
  // 郵便番号データは町域までなので、番地・丁目まで含めず段階的に短くして照合する。
  const normalized = address.normalize("NFKC").replace(/\s+/g, "").trim();
  const terms = [
    normalized.replace(/[0-9].*$/, "").trim(),
    normalized.replace(/[一二三四五六七八九十百千万]+丁目.*$/, "").trim(),
    normalized.replace(/(?:丁目|番地|番|号).*/, "").trim(),
  ].filter(Boolean);
  return [...new Set(terms)].slice(0, 3);
}

function postalCandidates(value: unknown) {
  const root = typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  const data = root?.data;
  const dataRecord = typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
  const results = Array.isArray(dataRecord?.results) ? dataRecord.results : [];
  const unique = new Map<string, { postal_code: string; prefecture: string; city: string; town: string }>();
  for (const result of results.slice(0, 20)) {
    const item = result as PostalHelperResult;
    const postalCode = text(item.zipcode, 7)?.replace(/[^0-9]/g, "") ?? "";
    const prefecture = text(item.pref, 20);
    const city = text(item.city, 100);
    const town = text(item.town, 150);
    if (/^\d{7}$/.test(postalCode) && prefecture && city && town) {
      unique.set(`${postalCode}:${prefecture}:${city}:${town}`, { postal_code: postalCode, prefecture, city, town });
    }
  }
  return [...unique.values()];
}

function googlePostalCandidates(
  value: unknown,
  fallback: { prefecture: string; city: string; address: string },
) {
  const root = typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
  const results = Array.isArray(root?.results) ? root.results : [];
  const unique = new Map<string, { postal_code: string; prefecture: string; city: string; town: string }>();

  for (const rawResult of results.slice(0, 5)) {
    const result = rawResult as GoogleGeocodingResult;
    const components = Array.isArray(result.address_components) ? result.address_components as GoogleAddressComponent[] : [];
    const getComponent = (...types: string[]) => {
      const component = components.find((item) => {
        const itemTypes = Array.isArray(item.types) ? item.types : [];
        return types.some((type) => itemTypes.includes(type));
      });
      return text(component?.long_name, 150);
    };
    const postalCode = getComponent("postal_code")?.replace(/[^0-9]/g, "") ?? "";
    if (!/^\d{7}$/.test(postalCode)) continue;

    const prefecture = getComponent("administrative_area_level_1") ?? fallback.prefecture;
    const city = getComponent("locality", "administrative_area_level_2") ?? fallback.city;
    const town = [
      getComponent("sublocality_level_2", "sublocality_level_1", "sublocality"),
      getComponent("route"),
    ].filter((item): item is string => Boolean(item)).join("") || fallback.address;
    unique.set(`${postalCode}:${prefecture}:${city}:${town}`, {
      postal_code: postalCode,
      prefecture,
      city,
      town,
    });
  }
  return [...unique.values()];
}

async function lookupByGoogleGeocoding(
  address: string,
  fallback: { prefecture: string; city: string; address: string },
) {
  const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY?.trim();
  if (!apiKey) return { candidates: [], diagnostic: "Google Geocoding API：APIキー未設定" };

  const query = new URLSearchParams({
    address,
    components: "country:JP",
    language: "ja",
    key: apiKey,
  });
  try {
    const response = await fetch(`${GOOGLE_GEOCODING_URL}?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body: unknown = await response.json().catch(() => null);
    const status = typeof (body as Record<string, unknown> | null)?.status === "string"
      ? (body as Record<string, unknown>).status
      : `HTTP ${response.status}`;
    if (!response.ok || status !== "OK") {
      const errorMessage = text((body as Record<string, unknown> | null)?.error_message, 180);
      return { candidates: [], diagnostic: `Google Geocoding API：${status}${errorMessage ? `（${errorMessage}）` : ""}` };
    }
    const candidates = googlePostalCandidates(body, fallback);
    return { candidates, diagnostic: `Google Geocoding API：${candidates.length}件` };
  } catch {
    return { candidates: [], diagnostic: "Google Geocoding API：通信失敗またはタイムアウト" };
  }
}

export async function POST(request: NextRequest) {
  let body: { prefecture?: unknown; city?: unknown; address?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const prefecture = text(body.prefecture, 20);
  const city = text(body.city, 100);
  const address = text(body.address, 300);
  const towns = address ? townLookupTerms(address) : [];
  if (!prefecture || !city || towns.length === 0) {
    return NextResponse.json({ error: "prefecture, city and town are required" }, { status: 400 });
  }

  const diagnostics: string[] = [];
  const candidates = new Map<string, { postal_code: string; prefecture: string; city: string; town: string }>();
  try {
    const fullAddress = `${prefecture}${city}${address}`;
    const google = await lookupByGoogleGeocoding(fullAddress, { prefecture, city, address });
    diagnostics.push(`住所「${fullAddress}」`, google.diagnostic);
    for (const candidate of google.candidates) {
      candidates.set(`${candidate.postal_code}:${candidate.prefecture}:${candidate.city}:${candidate.town}`, candidate);
    }
    if (candidates.size > 0) {
      console.info("[rpa/postal-codes] google lookup", { prefecture, city, resultCount: candidates.size });
      return NextResponse.json({ postal_codes: [...candidates.values()], diagnostics });
    }

    diagnostics.push("Googleで郵便番号を特定できなかったため、町名検索へ切り替えました。");
    for (const town of towns) {
      const query = new URLSearchParams({ pref: prefecture, city, town });
      const response = await fetch(`${POSTAL_HELPER_URL}?${query}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        diagnostics.push(`検索語「${town}」：検索サービス HTTP ${response.status}`);
        continue;
      }
      const found = postalCandidates(await response.json());
      diagnostics.push(`検索語「${town}」：${found.length}件`);
      for (const candidate of found) {
        candidates.set(`${candidate.postal_code}:${candidate.prefecture}:${candidate.city}:${candidate.town}`, candidate);
      }
      if (found.length > 0) break;
    }
    console.info("[rpa/postal-codes] lookup", {
      prefecture,
      city,
      terms: towns,
      resultCount: candidates.size,
    });
    return NextResponse.json({ postal_codes: [...candidates.values()], diagnostics });
  } catch {
    console.warn("[rpa/postal-codes] lookup failed", { prefecture, city, terms: towns });
    return NextResponse.json({ error: "postal lookup failed", diagnostics: [...diagnostics, "検索サービスへの接続が失敗またはタイムアウトしました"] }, { status: 502 });
  }
}
