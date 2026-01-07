// src/app/api/event-template/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { isAdminByAuthUserId } from "@/lib/auth/isAdmin";
import type {
  UpsertEventTemplatePayload,
  EventTemplateRequiredDocRow,
} from "@/types/eventTemplate";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // テンプレ一覧
  const { data: templates, error: tErr } = await supabase
    .from("event_template")
    .select(
      "id, template_name, overview, due_rule_type, due_offset_days, due_rule_json, is_active, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  // required_docs
  const { data: reqDocs, error: dErr } = await supabase
    .from("event_template_required_docs")
    .select(
      "id, template_id, doc_type_id, check_source, sort_order, memo, created_at, updated_at"
    )
    .order("template_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }

  // user_doc_master を join 用に取得（category+label 表示）
  const docTypeIds = Array.from(new Set((reqDocs ?? []).map((r) => r.doc_type_id)));
  const { data: docMaster, error: mErr } = await supabase
    .from("user_doc_master")
    .select("id, category, label, is_active")
    .in("id", docTypeIds.length ? docTypeIds : ["00000000-0000-0000-0000-000000000000"]);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const docMap = new Map<string, { category: string; label: string; is_active: boolean }>();
  (docMaster ?? []).forEach((d) => docMap.set(d.id, d));

  // まとめ
  const docsByTemplate = new Map<string, EventTemplateRequiredDocRow[]>();
  (reqDocs ?? []).forEach((r) => {
    const m = docMap.get(r.doc_type_id);
    const row = {
      ...r,
      doc_category: m?.category ?? null,
      doc_label: m?.label ?? null,
      doc_master_is_active: m?.is_active ?? null,
    };
    const arr = docsByTemplate.get(r.template_id) ?? [];
    arr.push(row);
    docsByTemplate.set(r.template_id, arr);
  });

  const result = (templates ?? []).map((t) => ({
    ...t,
    required_docs: docsByTemplate.get(t.id) ?? [],
  }));

  // admin 判定も返す（UIでボタン表示切替用）
  const admin = await isAdminByAuthUserId(supabase, user.id);

  return NextResponse.json({ admin, templates: result });
}

export async function POST(req: Request) {
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

  const body = (await req.json()) as UpsertEventTemplatePayload;

  if (!body?.template_name?.trim()) {
    return NextResponse.json({ error: "template_name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.required_docs)) {
    return NextResponse.json({ error: "required_docs is required" }, { status: 400 });
  }

  // 1) template 作成
  const { data: tIns, error: tErr } = await supabase
    .from("event_template")
    .insert({
      template_name: body.template_name.trim(),
      overview: body.overview ?? null,
      due_rule_type: body.due_rule_type ?? "manual",
      due_offset_days: body.due_offset_days ?? 0,
      due_rule_json: (body.due_rule_json ?? {}) as Record<string, unknown>,
      is_active: body.is_active ?? true,
    })
    .select("id")
    .single();

  if (tErr) {
    return NextResponse.json({ error: tErr.message }, { status: 500 });
  }

  const templateId = tIns.id as string;

  // 2) required_docs 作成
  const rows = body.required_docs.map((d, idx) => ({
    template_id: templateId,
    doc_type_id: d.doc_type_id,
    check_source: d.check_source,
    sort_order: typeof d.sort_order === "number" ? d.sort_order : (idx + 1) * 10,
    memo: d.memo ?? null,
  }));

  if (rows.length) {
    const { error: rErr } = await supabase.from("event_template_required_docs").insert(rows);
    if (rErr) {
      return NextResponse.json({ error: rErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: templateId });
}
