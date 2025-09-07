// src/app/api/shift-record-items/route.ts
// テーブル: public.shift_record_items(id uuid PK, record_id uuid, item_def_id uuid, value_text text, note text, created_at, updated_at)
// ※ upsert の onConflict に対応するため、DB 側に UNIQUE(record_id, item_def_id) を追加しておいてください。

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- 入力検証 -------------------------------------------------------------
const RowSchema = z.object({
  record_id: z.string().uuid(),
  item_def_id: z.string().uuid(),
  value: z.unknown().optional(),
  note: z.string().optional(),
});
const BodySchema = z.array(RowSchema).min(1);

type RowInput = z.infer<typeof RowSchema>;

type RowInsert = {
  record_id: string;
  item_def_id: string;
  value_text: string | null;
  note: string | null;
};

// ---- ユーティリティ -------------------------------------------------------
function rid(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
}

function toText(v: unknown): string | null {
  if (v === null || typeof v === "undefined") return null;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function fmtPgErr(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
  const pe = e as Partial<PostgrestError> | undefined;
  if (pe && typeof pe.message === "string") {
    return { message: pe.message, code: pe.code, details: pe.details, hint: pe.hint };
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

// ---- Handler --------------------------------------------------------------
export async function POST(req: Request) {
  const id = rid();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json", rid: id }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(bodyUnknown);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", rid: id, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const rows: RowInsert[] = parsed.data.map((r: RowInput) => ({
    record_id: r.record_id,
    item_def_id: r.item_def_id,
    value_text: toText(r.value),
    note: r.note ?? null,
  }));

  try {
    const sb = supabaseAdmin;
    const { error } = await sb
      .from("shift_record_items")
      .upsert(rows, { onConflict: "record_id,item_def_id" });

    if (error) {
      const pe = fmtPgErr(error);
      console.error("[/api/shift-record-items][POST] upsert error", id, pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, { status: 500 });
    }

    return NextResponse.json({ ok: true, upserted: rows.length }, { headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = fmtPgErr(e);
    console.error("[/api/shift-record-items][POST] exception", id, pe);
    return NextResponse.json({ error: pe.message, rid: id }, { status: 500 });
  }
}
