//api/assessment/[id]/route.ts
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

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("assessments_records")
      .select("*")
      .eq("assessment_id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (error) throw error;
    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;

    const body = await req.json();
    const assessed_on = String(body.assessed_on ?? "").trim();
    const author_name = String(body.author_name ?? "").trim();
    const content = body.content ?? {};

    // ★ any を消す
    const patch: { content: unknown; assessed_on?: string; author_name?: string } = { content };
    if (assessed_on) patch.assessed_on = assessed_on;
    if (author_name) patch.author_name = author_name;

    const { data, error } = await supabaseAdmin
      .from("assessments_records")
      .update(patch)
      .eq("assessment_id", id)
      .select("*")
      .single();

    if (error) throw error;
    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from("assessments_records")
      .update({ is_deleted: true })
      .eq("assessment_id", id)
      .select("*")
      .single();

    if (error) throw error;
    return json({ ok: true, data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}
