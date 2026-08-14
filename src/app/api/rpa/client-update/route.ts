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

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id")
    .eq("kaipoke_cs_id", kaipokeCsId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: "client lookup failed" }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "client not found" }, { status: 404 });

  const prefecture = nullableText(profile?.prefecture, 100);
  const city = nullableText(profile?.city, 100);
  const town = nullableText(profile?.town, 200);
  const building = nullableText(profile?.building, 200);
  const address = [prefecture, city, town, building].filter(Boolean).join("") || null;
  const update: Record<string, string | boolean> = { name };
  const values: Array<[string, unknown, number]> = [
    ["kana", profile?.kana, 200],
    ["gender", profile?.gender, 20],
    ["birth_yyyy_mm_dd", profile?.birthDate, 100],
    ["postal_code", profile?.postalCode, 20],
    ["phone_01", profile?.phone, 50],
    ["phone_02", profile?.mobilePhone, 50],
    ["biko", profile?.biko, 10000],
  ];
  for (const [key, value, maxLength] of values) {
    const normalized = nullableText(value, maxLength);
    if (normalized !== null) update[key] = normalized;
  }
  if (address) update.address = address;
  if (typeof profile?.clientStatus === "string" && profile.clientStatus.trim()) {
    update.is_active = profile.clientStatus === "利用中";
  }
  const { error: updateError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .update(update)
    .eq("id", existing.id);
  if (updateError) return NextResponse.json({ error: "client update failed" }, { status: 500 });

  return NextResponse.json({ updated: true });
}
