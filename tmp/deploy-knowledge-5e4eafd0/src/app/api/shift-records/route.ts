// ================================
// 2) src/app/api/shift-records/route.ts（Create-on-Read／200統一／valid exports）
// ================================
import { NextResponse as Next } from "next/server";
import { supabaseAdmin as SB } from "@/lib/supabase/service";
import type { PostgrestError as PgErr } from "@supabase/supabase-js";
import { z as Z } from "zod";
import { randomUUID as uuid } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DbStatus = "draft" | "submitted" | "approved" | "archived" | (string & {});
export type ApiStatus = "入力中" | "完了" | (string & {});
const toApi = (s: DbStatus): ApiStatus => (s === "approved" ? "完了" : "入力中");
const toDb = (s: unknown): DbStatus => (s === "完了" ? "approved" : "draft");

type Row = { id: string; status: DbStatus; updated_at: string | null };

const ShiftId = Z.union([Z.number().finite(), Z.string().regex(/^-?\d+$/)]);
const PostBody = Z.object({ shift_id: ShiftId, status: Z.union([Z.literal("入力中"), Z.literal("完了")]).optional() });

async function getOrCreateOne(shiftIdNum: number): Promise<Row> {
  const sb = SB;

  const { data, error } = await sb
    .from("shift_records")
    .select("id,status,updated_at")
    .eq("shift_id", shiftIdNum)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<Row>();

  if (error) throw error;

  if (data) return data;

  const { data: created, error: insErr } = await sb
    .from("shift_records")
    .insert({ shift_id: shiftIdNum, status: "draft" as DbStatus })
    .select("id,status,updated_at")
    .single<Row>();

  if (insErr) throw insErr;

  return created;
}

function parseShiftId(v: number | string): number {
  if (typeof v === "number") return Math.trunc(v);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("invalid shift_id (must be number for bigint)");
  return Math.trunc(n);
}

function pgErr(e: unknown): { message: string; code?: string; details?: unknown; hint?: unknown } {
  const pe = (e as Partial<PgErr>) || {};
  const message = typeof pe.message === "string" ? pe.message : (e instanceof Error ? e.message : String(e));
  const code = typeof pe.code === "string" ? pe.code : undefined;
  return { message, code, details: pe.details, hint: pe.hint };
}

export async function GET(req: Request) {
  const rid = uuid();
  const url = new URL(req.url);
  const qsShift = url.searchParams.get("shift_id");

  // ▼▼ 追加：ids（カンマ区切り）のバルク取得
  const qsIds = url.searchParams.get("ids");
  const format = url.searchParams.get("format"); // "db" 指定でDB生値を返す

  // --- バルク（ids=...）モード ---
  if (qsIds) {
    try {
      // ids をパース（空要素除去＆重複排除）
      const ids = Array.from(
        new Set(
          qsIds
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
        )
      );

      // バリデーション
      const parsedList = ids.map(id => {
        const r = ShiftId.safeParse(id);
        if (!r.success) throw new Error(`invalid shift_id in ids: "${id}"`);
        return parseShiftId(r.data);
      });

      // Create-on-Read を維持：各 id を順に処理
      const results: Array<{ shift_id: number; status: DbStatus | ApiStatus }> = [];
      for (const sid of parsedList) {
        const row = await getOrCreateOne(sid);
        results.push({
          shift_id: sid,
          status: format === "db" ? row.status : toApi(row.status),
        });
      }

      // 200 統一で配列返却
      return Next.json(results, { headers: { "x-debug-rid": rid } });
    } catch (e: unknown) {
      const pe = pgErr(e);
      return Next.json({ error: pe.message, rid }, { status: 400, headers: { "x-debug-rid": rid } });
    }
  }

  const parsed = ShiftId.safeParse(qsShift ?? undefined);
  if (!parsed.success) return Next.json({ error: "invalid shift_id (must be bigint number)", rid }, { status: 400 });
  const shiftIdNum = parseShiftId(parsed.data);

  try {
    const sb = SB;
    const { data, error } = await sb
      .from("shift_records")
      .select("id,status,updated_at")
      .eq("shift_id", shiftIdNum)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<Row>();

    if (error) {
      const pe = pgErr(error);
      return Next.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    if (data) {
      const out = { id: data.id, status: toApi(data.status), updated_at: data.updated_at };
      return Next.json(out, { headers: { "x-debug-rid": rid } });
    }

    const { data: created, error: insErr } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: "draft" as DbStatus })
      .select("id,status,updated_at")
      .single<Row>();

    if (insErr) {
      const pe = pgErr(insErr);
      return Next.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    const out = { id: created.id, status: toApi(created.status), updated_at: created.updated_at };
    return Next.json(out, { headers: { "x-debug-rid": rid } }); // 200 統一
  } catch (e: unknown) {
    const pe = pgErr(e);
    return Next.json({ error: pe.message, rid }, { status: 500, headers: { "x-debug-rid": rid } });
  }
}

export async function POST(req: Request) {
  const rid = uuid();

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return Next.json({ error: "invalid json", rid }, { status: 400 });
  }

  const parsed = PostBody.safeParse(bodyUnknown);
  if (!parsed.success) return Next.json({ error: "validation failed", rid, issues: parsed.error.issues }, { status: 400 });

  const shiftIdNum = parseShiftId(parsed.data.shift_id);
  const statusDb: DbStatus = parsed.data.status ? toDb(parsed.data.status) : "draft";

  try {
    const sb = SB;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id: shiftIdNum, status: statusDb })
      .select("id,status,updated_at")
      .single<Row>();

    if (error) {
      const pe = pgErr(error);
      return Next.json({ error: pe.message, code: pe.code, rid }, { status: 500, headers: { "x-debug-rid": rid } });
    }

    const out = { id: data.id, status: toApi(data.status), updated_at: data.updated_at };
    return Next.json(out, { status: 201, headers: { "x-debug-rid": rid } });
  } catch (e: unknown) {
    const pe = pgErr(e);
    return Next.json({ error: pe.message, rid }, { status: 500, headers: { "x-debug-rid": rid } });
  }
}