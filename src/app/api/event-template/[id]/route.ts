import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isAdminByAuthUserId } from "@/lib/auth/isAdmin";
import type { UpsertEventTemplatePayload } from "@/types/eventTemplate";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = params;

  // 🔐 Bearer token から user 取得
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authErr,
  } = await supabaseAdmin.auth.getUser(token);

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 👑 admin 判定（service-role）
  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as UpsertEventTemplatePayload;

  if (!body?.template_name?.trim()) {
    return NextResponse.json(
      { error: "template_name is required" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.required_docs)) {
    return NextResponse.json(
      { error: "required_docs is required" },
      { status: 400 }
    );
  }

  // 1️⃣ template 更新
  const { error: uErr } = await supabaseAdmin
    .from("event_template")
    .update({
      template_name: body.template_name.trim(),
      overview: body.overview ?? null,
      due_rule_type: body.due_rule_type ?? "manual",
      due_offset_days: body.due_offset_days ?? 0,
      due_rule_json: body.due_rule_json ?? {},
      is_active: body.is_active ?? true,
    })
    .eq("id", id);

  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  // 2️⃣ required_docs 全入替
  const { error: dErr } = await supabaseAdmin
    .from("event_template_required_docs")
    .delete()
    .eq("template_id", id);

  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  const rows = body.required_docs.map((d, idx) => ({
    template_id: id,
    doc_type_id: d.doc_type_id,
    check_source: d.check_source,
    sort_order:
      typeof d.sort_order === "number" ? d.sort_order : (idx + 1) * 10,
    memo: d.memo ?? null,
  }));

  if (rows.length > 0) {
    const { error: iErr } = await supabaseAdmin
      .from("event_template_required_docs")
      .insert(rows);

    if (iErr) {
      return NextResponse.json({ error: iErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { id } = params;

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authErr,
  } = await supabaseAdmin.auth.getUser(token);

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const hard = url.searchParams.get("hard") === "1";

  if (hard) {
    await supabaseAdmin
      .from("event_template_required_docs")
      .delete()
      .eq("template_id", id);

    await supabaseAdmin.from("event_template").delete().eq("id", id);

    return NextResponse.json({ ok: true, hard: true });
  }

  await supabaseAdmin
    .from("event_template")
    .update({ is_active: false })
    .eq("id", id);

  return NextResponse.json({ ok: true, hard: false });
}
