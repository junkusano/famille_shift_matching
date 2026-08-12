import { NextRequest, NextResponse } from "next/server";

const POSTAL_HELPER_URL = "https://postal.japal.co.jp/v1/postal-codes";

type PostalHelperResult = {
  zipcode?: unknown;
  pref?: unknown;
  city?: unknown;
  town?: unknown;
};

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function townForPostalLookup(address: string): string {
  // 郵便番号の町域検索では番地以降が一致しないため、最初の数字以降を除外する。
  return address.normalize("NFKC").replace(/[0-9].*$/, "").trim();
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
  const town = address ? townForPostalLookup(address) : null;
  if (!prefecture || !city || !town) {
    return NextResponse.json({ error: "prefecture, city and town are required" }, { status: 400 });
  }

  const query = new URLSearchParams({ pref: prefecture, city, town });
  try {
    const response = await fetch(`${POSTAL_HELPER_URL}?${query}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return NextResponse.json({ error: "postal lookup failed" }, { status: 502 });
    return NextResponse.json({ postal_codes: postalCandidates(await response.json()) });
  } catch {
    return NextResponse.json({ error: "postal lookup failed" }, { status: 502 });
  }
}
