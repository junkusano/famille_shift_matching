// src/app/api/plan-services/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;
    const body = await req.json();

    const patch = {
      service_title: nullableString(body.service_title),
      service_detail: nullableString(body.service_detail),
      procedure_notes: nullableString(body.procedure_notes),
      observation_points: nullableString(body.observation_points),
      family_action: nullableString(body.family_action),
      schedule_note: nullableString(body.schedule_note),
      display_order: normalizeNumber(body.display_order),
      service_no: normalizeNumber(body.service_no),
      monthly_occurrence_factor: normalizeNumber(body.monthly_occurrence_factor),
      monthly_minutes: normalizeNumber(body.monthly_minutes),
      monthly_hours: normalizeNumber(body.monthly_hours),
    };

    const { data, error } = await supabaseAdmin
      .from("plan_services")
      .update(patch)
      .eq("plan_service_id", id)
      .select("*")
      .single();

    if (error) throw error;

    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/plan-services/[id]][PUT] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}

function nullableString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function normalizeNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}