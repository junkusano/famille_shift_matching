// ================================
// 1) src/app/api/shift-records/route.ts（Create-on-Read／200統一／valid exports）
// ================================
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbStatus = "draft" | "submitted" | "approved" | "archived" | (string & {});
export type ApiStatus = "入力中" | "完了" | (string & {});
const toApiStatus = (s: DbStatus): ApiStatus => (s === "approved" ? "完了" : "入力中");
const toDbStatus = (s: unknown): DbStatus => (s === "完了" ? "approved" : "draft");

type ShiftRecordRow = { id: string; status: DbStatus; updated_at: string | null };

const ShiftIdSchema = z.union([z.number().finite(), z.string().regex(/^-?\d+$/)]);
const PostBodySchema = z.object({ shift_id: ShiftIdSchema, status: z.union([z.literal("入力中"), z.literal("完了")]).optional() });

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

// ---- GET: 存在しなければその場で作成（201→200に統一） ----
export async function GET(req: Request) {
  const rid = randomUUID();
  const url = new URL(req.url);
  const qsShift = url.searchParams.get("shift_id");

  const parsed = ShiftIdSchema.safeParse(qsShift ?? undefined);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid shift_id (must be bigint number)", rid }, { status: 400 });
  }
  const shiftIdNum = parseShiftId(parsed.data);

  try {
    const sb = supabaseAdmin;

    // 1) 取得
    const { data, error } = await sb
      .from("shift_records")
      .select("id,status,updated_at")
      .eq("shift_id", shiftIdNum)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ShiftRecordRow>();

    if (error) {
      const pe = pgErr(error);
      return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    if (data) {
      const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
      return NextResponse.json(out, { headers: { "x-debug-rid": rid } });
    }

    // 2) 未存在 → 作成
    const { data: created, error: insErr } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: "draft" as DbStatus })
      .select("id,status,updated_at")
      .single<ShiftRecordRow>();

    if (insErr) {
      const pe = pgErr(insErr);
      return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    const out = { id: created.id, status: toApiStatus(created.status), updated_at: created.updated_at };
    return NextResponse.json(out, { headers: { "x-debug-rid": rid } }); // 200 に統一
  } catch (e: unknown) {
    const pe = pgErr(e);
    return NextResponse.json({ error: pe.message, rid }, { status: 500, headers: { "x-debug-rid": rid } });
  }
}

// ---- POST: 明示作成（互換） ----
export async function POST(req: Request) {
  const rid = randomUUID();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json", rid }, { status: 400 });
  }

  const parsed = PostBodySchema.safeParse(bodyUnknown);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", rid, issues: parsed.error.issues }, { status: 400 });
  }

  const shiftIdNum = parseShiftId(parsed.data.shift_id);
  const statusDb: DbStatus = parsed.data.status ? toDbStatus(parsed.data.status) : "draft";

  try {
    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: statusDb })
      .select("id,status,updated_at")
      .single<ShiftRecordRow>();

    if (error) {
      const pe = pgErr(error);
      return NextResponse.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
    return NextResponse.json(out, { status: 201, headers: { "x-debug-rid": rid } });
  } catch (e: unknown) {
    const pe = pgErr(e);
    return NextResponse.json({ error: pe.message, rid }, { status: 500, headers: { "x-debug-rid": rid } });
  }
}
