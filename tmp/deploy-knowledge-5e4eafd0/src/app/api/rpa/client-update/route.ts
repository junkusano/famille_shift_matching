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

type KaipokeCertificate = {
  number?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
};

type KaipokeCertificates = {
  careInsuranceObserved?: unknown;
  careInsurance?: KaipokeCertificate | null;
  disabilityRecipientObserved?: unknown;
  disabilityRecipient?: KaipokeCertificate | null;
};

function nullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: {
    kaipoke_cs_id?: unknown;
    profile?: KaipokeProfile;
    certificates?: KaipokeCertificates;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const kaipokeCsId = nullableText(body.kaipoke_cs_id, 20);
  const profile = body.profile;
  const certificates = body.certificates;
  const name = nullableText(profile?.name, 200);
  const careInsuranceObserved = certificates?.careInsuranceObserved === true;
  const disabilityRecipientObserved = certificates?.disabilityRecipientObserved === true;
  if (
    !kaipokeCsId
    || !KAIPOKE_ID_PATTERN.test(kaipokeCsId)
    || !name
  ) {
    return NextResponse.json(
      { error: "valid kaipoke_cs_id and name are required" },
      { status: 400 },
    );
  }

  const prefecture = nullableText(profile?.prefecture, 100);
  const city = nullableText(profile?.city, 100);
  const town = nullableText(profile?.town, 200);
  const building = nullableText(profile?.building, 200);
  const address = [prefecture, city, town, building].filter(Boolean).join("") || null;
  const update: Record<string, string | boolean | null> = {
    kaipoke_cs_id: kaipokeCsId,
    name,
  };
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

  // 証書種別を画面側で明示的に確認できた場合だけ、その種別専用カラムを同期する。
  // 介護保険証と障害福祉受給者証は似た画面だが、相互のカラムへは書き込まない。
  if (careInsuranceObserved) {
    const care = certificates?.careInsurance;
    update.kaigo_hoken_no = nullableText(care?.number, 20);
    update.kaigo_start_at = nullableText(care?.validFrom, 20);
    update.kaigo_end_at = nullableText(care?.validTo, 20);
  }
  if (disabilityRecipientObserved) {
    const disability = certificates?.disabilityRecipient;
    update.shogai_jukyusha_no = nullableText(disability?.number, 20);
    update.shogai_start_at = nullableText(disability?.validFrom, 20);
    update.shogai_end_at = nullableText(disability?.validTo, 20);
  }

  // kaipoke_cs_id の一意制約を競合キーにして、事前SELECTなしの1リクエストで同期する。
  // 新規・既存のどちらでも同じ処理となり、重複エラーを正常系として扱わない。
  const { data: upserted, error: updateError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .upsert(update, { onConflict: "kaipoke_cs_id" })
    .select("id")
    .single();
  if (updateError) {
    console.error("[rpa/client-update] upsert failed", {
      code: updateError.code,
      message: updateError.message,
      kaipokeCsId,
    });
    return NextResponse.json({ error: "client upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ upserted: true, id: upserted.id });
}
