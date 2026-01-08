//api/event-template/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { isAdminByAuthUserId } from "@/lib/auth/isAdmin";
import type { UpsertEventTemplatePayload } from "@/types/eventTemplate";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: Request, { params }: RouteContext) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdminByAuthUserId(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const body = (await req.json()) as UpsertEventTemplatePayload;

  if (!body?.template_name?.trim()) {
    return NextResponse.json({ error: "template_name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.required_docs)) {
    return NextResponse.json({ error: "required_docs is required" }, { status: 400 });
  }

  const { error: uErr } = await supabase
    .from("event_template")
    .update({
      template_name: body.template_name.trim(),
      overview: body.overview ?? null,
      due_rule_type: body.due_rule_type ?? "manual",
      due_offset_days: body.due_offset_days ?? 0,
      due_rule_json: (body.due_rule_json ?? {}) as Record<string, unknown>,
      is_active: body.is_active ?? true,
    })
    .eq("id", id);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const { error: dErr } = await supabase
    .from("event_template_required_docs")
    .delete()
    .eq("template_id", id);

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  const rows = body.required_docs.map((d, idx) => ({
    template_id: id,
    doc_type_id: d.doc_type_id,
    check_source: d.check_source,
    sort_order: typeof d.sort_order === "number" ? d.sort_order : (idx + 1) * 10,
    memo: d.memo ?? null,
  }));

  if (rows.length) {
    const { error: iErr } = await supabase.from("event_template_required_docs").insert(rows);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdminByAuthUserId(supabase, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (hard) {
    const { error: dErr } = await supabase
      .from("event_template_required_docs")
      .delete()
      .eq("template_id", id);
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

    const { error: tErr } = await supabase.from("event_template").delete().eq("id", id);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, hard: true });
  }

  const { error: uErr } = await supabase
    .from("event_template")
    .update({ is_active: false })
    .eq("id", id);

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, hard: false });
}
