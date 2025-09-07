// src/app/api/shift-records/route.ts
// Next.js 15 / bigint(=int8) shift_id / 厳密型 / 充実ログ / any 不使用版
// - テーブル: public.shift_records(id uuid PK, shift_id bigint, status text, created_by uuid, created_at, updated_at)
// - ステータスは DB: 'draft'|'submitted'|'approved'|'archived'、API: '入力中'|'完了' に相互変換

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";        // Supabase Admin は Node 実行を推奨
export const dynamic = "force-dynamic"; // キャッシュさせない

// --- 型とマッピング -------------------------------------------------------
// DB 側の許容ステータス（チェック制約に合わせる）
type DbStatus = "draft" | "submitted" | "approved" | "archived" | (string & {});
// API で露出するステータス
export type ApiStatus = "入力中" | "完了" | (string & {});

const toApiStatus = (s: DbStatus): ApiStatus => (s === "approved" ? "完了" : "入力中");
const toDbStatus = (s: unknown): DbStatus => (s === "完了" ? "approved" : "draft");

// SELECT で返す最小カラム
export type ShiftRecordRow = { id: string; status: DbStatus; updated_at: string | null };

// shift_id のバリデーション（bigint 想定: 数値 or 数値文字列）
const ShiftIdSchema = z.union([z.number().finite(), z.string().regex(/^-?\d+$/)]);
const PostBodySchema = z.object({
  shift_id: ShiftIdSchema,
  status: z.union([z.literal("入力中"), z.literal("完了")]).optional(),
});

// --- ユーティリティ -------------------------------------------------------
function rid(): string {
  try {
    // ts-expect-error: Edge/Node 差異を吸収
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseShiftId(v: number | string): number {
  if (typeof v === "number") return Math.trunc(v);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("invalid shift_id (must be number for bigint)");
  return Math.trunc(n);
}

function pgErr(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
  const pe = (e as Partial<PostgrestError>) || {};
  const message = typeof pe.message === "string" ? pe.message : (e instanceof Error ? e.message : String(e));
  const code = typeof pe.code === "string" ? pe.code : undefined;
  return { message, code, details: pe.details, hint: pe.hint };
}

// --- Handlers -------------------------------------------------------------
export async function GET(req: Request) {
  const id = rid();
  const url = new URL(req.url);
  const qsShift = url.searchParams.get("shift_id");

  console.info("[/api/shift-records][GET]", id, { path: url.pathname, qs: Object.fromEntries(url.searchParams.entries()) });

  const parsed = ShiftIdSchema.safeParse(qsShift ?? undefined);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid shift_id (must be bigint number)", rid: id }, { status: 400 });
  }
  const shiftIdNum = parseShiftId(parsed.data);

  try {
    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("shift_records")
      .select("id,status,updated_at")
      .eq("shift_id", shiftIdNum)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ShiftRecordRow>();

    if (error) {
      const pe = pgErr(error);
      console.error("[/api/shift-records][GET] select error", id, pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    if (!data) {
      console.info("[/api/shift-records][GET]", id, "not found");
      return NextResponse.json({ error: "not found", rid: id }, { status: 404, headers: { "x-debug-rid": id } });
    }

    const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
    console.info("[/api/shift-records][GET] ok", id, { record_id: data.id, status_db: data.status, status_api: out.status });
    return NextResponse.json(out, { headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = pgErr(e);
    console.error("[/api/shift-records][GET] exception", id, pe);
    return NextResponse.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}

export async function POST(req: Request) {
  const id = rid();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json", rid: id }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(bodyUnknown);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", rid: id, issues: parsed.error.issues }, { status: 400 });
  }

  const shiftIdNum = parseShiftId(parsed.data.shift_id);
  const statusDb: DbStatus = parsed.data.status ? toDbStatus(parsed.data.status) : "draft";

  console.info("[/api/shift-records][POST]", id, { shift_id: shiftIdNum, statusDb });

  try {
    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: statusDb })
      .select("id,status,updated_at")
      .single<ShiftRecordRow>();

    if (error) {
      const pe = pgErr(error);
      console.error("[/api/shift-records][POST] insert error", id, pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
    console.info("[/api/shift-records][POST] created", id, { record_id: data.id, status_db: data.status, status_api: out.status });
    return NextResponse.json(out, { status: 201, headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = pgErr(e);
    console.error("[/api/shift-records][POST] exception", id, pe);
    return NextResponse.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}
