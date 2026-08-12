import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

const KAIPOKE_ID_PATTERN = /^\d{1,20}$/;

type KaipokeProfile = {
  name?: unknown;
  kana?: unknown;
  gender?: unknown;
  birthDate?: unknown;
  postalCode?: unknown;
  prefecture?: unknown;
  city?: unknown;
  town?: unknown;
  building?: unknown;
  phone?: unknown;
  mobilePhone?: unknown;
  clientStatus?: unknown;
  biko?: unknown;
};

function nullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export const dynamic = "force-dynamic";

/**
 * POST /api/rpa/client-register
 *
 * Creates a My Famille client only when the Kaipoke internal ID is not yet
 * registered. Existing records are never overwritten by this endpoint.
 */
export async function POST(request: NextRequest) {
  let body: { kaipoke_cs_id?: unknown; profile?: KaipokeProfile };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const kaipokeCsId = nullableText(body.kaipoke_cs_id, 20);
  const profile = body.profile;
  const name = nullableText(profile?.name, 200);

  if (!kaipokeCsId || !KAIPOKE_ID_PATTERN.test(kaipokeCsId) || !name) {
    return NextResponse.json({ error: "valid kaipoke_cs_id and name are required" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id")
    .eq("kaipoke_cs_id", kaipokeCsId)
    .maybeSingle();

  if (existingError) {
    console.error("[rpa/client-register] existing lookup failed", { code: existingError.code });
    return NextResponse.json({ error: "client lookup failed" }, { status: 500 });
  }

  if (existing) return NextResponse.json({ created: false });

  const prefecture = nullableText(profile?.prefecture, 100);
  const city = nullableText(profile?.city, 100);
  const town = nullableText(profile?.town, 200);
  const building = nullableText(profile?.building, 200);
  const address = [prefecture, city, town, building].filter(Boolean).join("") || null;
  const clientStatus = nullableText(profile?.clientStatus, 100);

  const { error: insertError } = await supabaseAdmin.from("cs_kaipoke_info").insert({
    kaipoke_cs_id: kaipokeCsId,
    name,
    kana: nullableText(profile?.kana, 200),
    gender: nullableText(profile?.gender, 20),
    birth_yyyy_mm_dd: nullableText(profile?.birthDate, 100),
    postal_code: nullableText(profile?.postalCode, 20),
    address,
    phone_01: nullableText(profile?.phone, 50),
    phone_02: nullableText(profile?.mobilePhone, 50),
    biko: nullableText(profile?.biko, 10000),
    is_active: clientStatus === "利用中",
  });

  if (insertError) {
    console.error("[rpa/client-register] insert failed", { code: insertError.code });
    return NextResponse.json({ error: "client registration failed" }, { status: 500 });
  }

  return NextResponse.json({ created: true }, { status: 201 });
}
