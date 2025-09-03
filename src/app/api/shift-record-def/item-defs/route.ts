// ==========================
// /app/api/shift-record-def/item-defs/route.ts
// 一覧取得（GET）／新規作成（POST）
// ==========================
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Missing Supabase env");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// 型（DBに合わせて最低限）
export type ShiftRecordItemDef = {
  id: string;
  l_id: string | null;
  s_id: string | null;
  code: string;
  label: string;
  input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display";
  unit: string | null;
  required: boolean;
  sort_order: number;
  active: boolean;
  options: Record<string, unknown>;
  default_value?: unknown | null; // ← 重要
};

function parseDefaultLoose(v: unknown): unknown {
  // UIから文字列で来ても受け入れる
  if (v == null || v === "") return null;
  if (typeof v !== "string") return v; // 既にJSON型ならそのまま
  const t = v.trim();
  if (!t) return null;
  if (t.startsWith("[") || t.startsWith("{")) {
    try { return JSON.parse(t); } catch { return t; }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
  if (t === "true" || t === "false") return t === "true";
  return t; // 通常の文字列
}

export async function GET() {
  const sb = getClient();
  const { data, error } = await sb
    .from("shift_record_item_defs")
    .select("*")
    .order("l_id", { nullsFirst: true })
    .order("s_id", { nullsFirst: true })
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as ShiftRecordItemDef[]);
}

export async function POST(req: Request) {
  const body = await req.json();
  const payload: ShiftRecordItemDef = {
    id: body.id, // 既に採番して送る運用 or DBのデフォルトに任せるなら外してください
    l_id: body.l_id ?? null,
    s_id: body.s_id ?? null,
    code: body.code,
    label: body.label,
    input_type: body.input_type,
    unit: body.unit ?? null,
    required: !!body.required,
    sort_order: Number(body.sort_order ?? 1000),
    active: body.active !== false,
    options: body.options ?? {},
    default_value: parseDefaultLoose(body.default_value),
  } as ShiftRecordItemDef;

  const sb = getClient();
  const { data, error } = await sb
    .from("shift_record_item_defs")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as ShiftRecordItemDef, { status: 201 });
}

// ==========================
// /app/api/shift-record-def/item-defs/[id]/route.ts
// 更新（PUT）／削除（DELETE 任意）
// ==========================
import type { NextRequest } from "next/server";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const payload = {
    l_id: body.l_id ?? null,
    s_id: body.s_id ?? null,
    code: body.code,
    label: body.label,
    input_type: body.input_type,
    unit: body.unit ?? null,
    required: !!body.required,
    sort_order: Number(body.sort_order ?? 1000),
    active: body.active !== false,
    options: body.options ?? {},
    default_value: parseDefaultLoose(body.default_value), // ← 重要
  };

  const sb = getClient();
  const { data, error } = await sb
    .from("shift_record_item_defs")
    .update(payload)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = getClient();
  const { error } = await sb.from("shift_record_item_defs").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
