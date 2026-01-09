import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isAdminByAuthUserId } from "@/lib/auth/isAdmin";
import type {
  UpsertEventTemplatePayload,
  EventTemplateRequiredDocRow,
} from "@/types/eventTemplate";

/**
 * Bearer token から Supabase user を取得
 */
async function getUserFromBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { user: null, error: "Missing token" };

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return { user: null, error: error?.message ?? "Invalid token" };
  return { user, error: null };
}

export async function GET(req: Request) {
  const { user, error: bearerErr } = await getUserFromBearer(req);
  if (!user) {
    return NextResponse.json({ error: bearerErr ?? "Unauthorized" }, { status: 401 });
  }

  // templates
  const { data: templates, error: tErr } = await supabaseAdmin
    .from("event_template")
    .select(
      "id, template_name, overview, due_rule_type, due_offset_days, due_rule_json, is_active, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  // required_docs
  const { data: reqDocs, error: dErr } = await supabaseAdmin
    .from("event_template_required_docs")
    .select("id, template_id, doc_type_id, check_source, sort_order, memo, created_at, updated_at")
    .order("template_id", { ascending: true })
    .order("sort_order", { ascending: true });

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // join 用：user_doc_master
  const docTypeIds = Array.from(new Set((reqDocs ?? []).map((r) => r.doc_type_id))).filter(
    (x): x is string => !!x
  );

  const { data: docMaster, error: mErr } = await supabaseAdmin
    .from("user_doc_master")
    .select("id, category, label, is_active")
    .in("id", docTypeIds.length ? docTypeIds : ["00000000-0000-0000-0000-000000000000"]);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const docMap = new Map<string, { category: string; label: string; is_active: boolean }>();
  (docMaster ?? []).forEach((d) => {
    docMap.set(d.id, { category: d.category, label: d.label, is_active: d.is_active });
  });

  const docsByTemplate = new Map<string, EventTemplateRequiredDocRow[]>();
  (reqDocs ?? []).forEach((r) => {
    const m = docMap.get(r.doc_type_id);
    export type EventTemplateRequiredDocRow = {
      id: string;
      template_id: string;
      doc_type_id: string;
      check_source: string; // CheckSource でもOK
      sort_order: number;
      memo: string | null;
      created_at: string;
      updated_at: string;

      // join表示用
      doc_category: string | null;
      doc_label: string | null;
      doc_master_is_active: boolean | null; // ✅ これを追加
    };


    const arr = docsByTemplate.get(r.template_id) ?? [];
    arr.push(row);
    docsByTemplate.set(r.template_id, arr);
  });

  const result = (templates ?? []).map((t) => ({
    ...t,
    required_docs: docsByTemplate.get(t.id) ?? [],
  }));

  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);

  return NextResponse.json({ admin, templates: result });
}

export async function POST(req: Request) {
  const { user, error: bearerErr } = await getUserFromBearer(req);
  if (!user) {
    return NextResponse.json({ error: bearerErr ?? "Unauthorized" }, { status: 401 });
  }

  const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as UpsertEventTemplatePayload;

  if (!body?.template_name?.trim()) {
    return NextResponse.json({ error: "template_name is required" }, { status: 400 });
  }
  if (!Array.isArray(body.required_docs)) {
    return NextResponse.json({ error: "required_docs is required" }, { status: 400 });
  }

  // 1) template insert
  const { data: tIns, error: tErr } = await supabaseAdmin
    .from("event_template")
    .insert({
      template_name: body.template_name.trim(),
      overview: body.overview ?? null,
      due_rule_type: body.due_rule_type ?? "manual",
      due_offset_days: body.due_offset_days ?? 0,
      due_rule_json: body.due_rule_json ?? {},
      is_active: body.is_active ?? true,
    })
    .select("id")
    .single();

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const templateId = tIns.id;

  // 2) required_docs insert
  const rows = body.required_docs
    .filter((d) => !!d.doc_type_id)
    .map((d, idx) => ({
      template_id: templateId,
      doc_type_id: d.doc_type_id,
      check_source: d.check_source,
      sort_order: typeof d.sort_order === "number" ? d.sort_order : (idx + 1) * 10,
      memo: d.memo ?? null,
    }));

  if (rows.length > 0) {
    const { error: rErr } = await supabaseAdmin
      .from("event_template_required_docs")
      .insert(rows);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: templateId });
}
