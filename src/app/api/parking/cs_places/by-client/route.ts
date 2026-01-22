// src/app/api/parking/cs_places/by-client/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  kaipoke_cs_id: string;
  serial: number;
  label: string;
  location_link: string | null;
  parking_orientation: string | null;
  remarks: string | null;
  permit_required: boolean | null;
  police_station_place_id: string | null;
  is_active: boolean;
};

export async function GET(req: NextRequest) {
  const { user } = await getUserFromBearer(req);
  if (!user?.id) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const csId = (searchParams.get("cs_id") ?? "").trim();
  if (!csId) return NextResponse.json({ ok: false, message: "missing cs_id" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("parking_cs_places")
    .select("id,kaipoke_cs_id,serial,label,location_link,parking_orientation,remarks,permit_required,police_station_place_id,is_active")
    .eq("kaipoke_cs_id", csId)
    .eq("is_active", true)
    .order("serial", { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, rows: (data ?? []) as Row[] });
}
