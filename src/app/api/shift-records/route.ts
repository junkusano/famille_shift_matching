// ================================
// 2) src/app/api/shift-records/route.ts（Create-on-Read／201→200統一）
// ================================
import { NextResponse as NextResponse_ } from "next/server";
import { supabaseAdmin as supabaseAdmin_ } from "@/lib/supabase/service";
import type { PostgrestError as PostgrestError_ } from "@supabase/supabase-js";
import { z as z_ } from "zod";
import { randomUUID as randomUUID_ } from "node:crypto";

export const runtime_ = "nodejs";
export const dynamic_ = "force-dynamic";

type DbStatus_ = "draft" | "submitted" | "approved" | "archived" | (string & {});
export type ApiStatus_ = "入力中" | "完了" | (string & {});
const toApiStatus_ = (s: DbStatus_): ApiStatus_ => (s === "approved" ? "完了" : "入力中");
const toDbStatus_ = (s: unknown): DbStatus_ => (s === "完了" ? "approved" : "draft");

type ShiftRecordRow_ = { id: string; status: DbStatus_; updated_at: string | null };

const ShiftIdSchema_ = z_.union([z_.number().finite(), z_.string().regex(/^-?\d+$/)]);
const PostBodySchema_ = z_.object({ shift_id: ShiftIdSchema_, status: z_.union([z_.literal("入力中"), z_.literal("完了")]).optional() });

function pgErr_(e: unknown): { message: string; code?: string } {
  const pe = e as Partial<PostgrestError_> | undefined;
  return { message: pe?.message ?? (e instanceof Error ? e.message : String(e)), code: pe?.code };
}

export async function GET(req: Request) {
  const id = randomUUID_();
  const url = new URL(req.url);
  const qsShift = url.searchParams.get("shift_id");

  const parsed = ShiftIdSchema_.safeParse(qsShift ?? undefined);
  if (!parsed.success) {
    return NextResponse_.json({ error: "invalid shift_id (must be bigint number)", rid: id }, { status: 400 });
  }
  const shiftIdNum = typeof parsed.data === "number" ? Math.trunc(parsed.data) : Math.trunc(Number(parsed.data));

  try {
    const sb = supabaseAdmin_;
    const { data, error } = await sb
      .from("shift_records")
      .select("id,status,updated_at")
      .eq("shift_id", shiftIdNum)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ShiftRecordRow_>();

    if (error) {
      const pe = pgErr_(error);
      return NextResponse_.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    if (data) {
      const out = { id: data.id, status: toApiStatus_(data.status), updated_at: data.updated_at };
      return NextResponse_.json(out, { headers: { "x-debug-rid": id } });
    }

    // 未存在 → その場で作成（201ではなく 200 に統一）
    const { data: created, error: insErr } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: "draft" as DbStatus_ })
      .select("id,status,updated_at")
      .single<ShiftRecordRow_>();

    if (insErr) {
      const pe = pgErr_(insErr);
      return NextResponse_.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    const out = { id: created.id, status: toApiStatus_(created.status), updated_at: created.updated_at };
    return NextResponse_.json(out, { headers: { "x-debug-rid": id } }); // 200 統一
  } catch (e: unknown) {
    const pe = pgErr_(e);
    return NextResponse_.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}

export async function POST(req: Request) {
  const id = randomUUID_();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return NextResponse_.json({ error: "invalid json", rid: id }, { status: 400 });
  }

  const parsed = PostBodySchema_.safeParse(bodyUnknown);
  if (!parsed.success) {
    return NextResponse_.json({ error: "validation failed", rid: id, issues: parsed.error.issues }, { status: 400 });
  }

  const shiftIdNum = typeof parsed.data.shift_id === "number" ? Math.trunc(parsed.data.shift_id) : Math.trunc(Number(parsed.data.shift_id));
  const statusDb: DbStatus_ = parsed.data.status ? toDbStatus_(parsed.data.status) : "draft";

  try {
    const sb = supabaseAdmin_;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: statusDb })
      .select("id,status,updated_at")
      .single<ShiftRecordRow_>();

    if (error) {
      const pe = pgErr_(error);
      return NextResponse_.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    const out = { id: data.id, status: toApiStatus_(data.status), updated_at: data.updated_at };
    return NextResponse_.json(out, { status: 201, headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = pgErr_(e);
    return NextResponse_.json({ error: pe.message, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}