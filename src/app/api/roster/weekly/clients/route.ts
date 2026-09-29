import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/service";

type ClientRow = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  postal_code: string | null;
  gender_request: string | null;
};

type GenderRow = {
  gender_request_id: string;
  gender_request_name: string;
  male_flg: boolean;
  female_flg: boolean;
};

type DistrictRow = {
  postal_code_3: string | null;
  dsp_short: string | null;
};

const postalPrefix = (value: string | null) => (value ?? "").replace(/\D/g, "").slice(0, 3);

export async function GET() {
  const [clientsResult, gendersResult, districtsResult] = await Promise.all([
    supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id,kaipoke_cs_id,name,postal_code,gender_request")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("cs_gender_request")
      .select("gender_request_id,gender_request_name,male_flg,female_flg"),
    supabaseAdmin
      .from("postal_distinct_fax_link_status")
      .select("postal_code_3,dsp_short"),
  ]);

  const error = clientsResult.error ?? gendersResult.error ?? districtsResult.error;
  if (error) {
    console.error("[weekly-roster-clients] failed to load display metadata", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const genders = new Map(
    ((gendersResult.data ?? []) as GenderRow[]).map((row) => [row.gender_request_id, row]),
  );
  const districts = new Map(
    ((districtsResult.data ?? []) as DistrictRow[])
      .filter((row) => row.postal_code_3)
      .map((row) => [String(row.postal_code_3), row.dsp_short]),
  );

  const clients = ((clientsResult.data ?? []) as ClientRow[]).map((client) => {
    const gender = client.gender_request ? genders.get(client.gender_request) : undefined;
    return {
      id: client.id,
      kaipoke_cs_id: client.kaipoke_cs_id,
      name: client.name,
      dsp_short: districts.get(postalPrefix(client.postal_code)) ?? null,
      gender_request_name: gender?.gender_request_name ?? null,
      male_flg: gender?.male_flg ?? null,
      female_flg: gender?.female_flg ?? null,
    };
  });

  return NextResponse.json(clients);
}
