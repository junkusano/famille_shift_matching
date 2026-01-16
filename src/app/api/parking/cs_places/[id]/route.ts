// src/app/api/parking/cs_places/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

type Body = {
  police_station_place_id?: string | null;
  label?: string;
  location_link?: string | null;
  parking_orientation?: string | null;
  permit_required?: boolean | null;
  remarks?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getUserFromBearer(req);
  if (!user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, message: "missing id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  // 空文字 → null
  const normalizedPoliceId =
    typeof body.police_station_place_id === "string"
      ? (() => {
          const v = body.police_station_place_id.trim();
          return v === "" ? null : v;
        })()
      : body.police_station_place_id ?? undefined;

  const updatePayload: Body = {
    police_station_place_id: normalizedPoliceId,
    label: typeof body.label === "string" ? body.label : undefined,
    location_link:
      typeof body.location_link === "string" || body.location_link === null
        ? body.location_link
        : undefined,
    parking_orientation:
      typeof body.parking_orientation === "string" || body.parking_orientation === null
        ? body.parking_orientation
        : undefined,
    permit_required:
      typeof body.permit_required === "boolean" || body.permit_required === null
        ? body.permit_required
        : undefined,
    remarks:
      typeof body.remarks === "string" || body.remarks === null ? body.remarks : undefined,
  };

  const { data, error } = await supabaseAdmin
    .from("parking_cs_places")
    .update({ ...updatePayload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,police_station_place_id,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, row: data });
}
