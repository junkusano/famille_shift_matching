// src/app/api/shift-records/route.ts
// Next.js 15 対応版（最小スキーマ準拠：id/shift_id/status/created_by/created_at/updated_at）
// - shift_records に client_name / values 列は無い前提
// - DB には status を 'draft'|'done' として保存、API では '入力中'|'完了' にマッピング

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";        // Supabase Admin は Node 実行を推奨
export const dynamic = "force-dynamic"; // キャッシュさせない

// --- status 変換 ---
type DbStatus = "draft" | "done" | (string & {});
type ApiStatus = "入力中" | "完了" | (string & {});
const toApiStatus = (s: DbStatus): ApiStatus => (s === "draft" ? "入力中" : s === "done" ? "完了" : (s as ApiStatus));
const toDbStatus = (s: unknown): DbStatus => (s === "完了" || s === "done") ? "done" : "draft"; // 既定は draft

// --- 選択カラム（最小） ---
// shift_id は WHERE に使うのみ。返却は id/status/updated_at のみで十分
export type ShiftRecordSelect = {
  id: string;
  status: DbStatus;
  updated_at: string | null; // timestamptz
};

// Supabase/PostgREST のエラーを安全に整形
function asPgError(e: unknown): { message?: string; code?: string; details?: unknown; hint?: unknown } {
  if (typeof e === "object" && e !== null) {
    const r = e as Record<string, unknown>;
    return {
      message: typeof r.message === "string" ? r.message : undefined,
      code: typeof r.code === "string" ? r.code : undefined,
      details: r.details,
      hint: r.hint,
    };
  }
  return { message: typeof e === "string" ? e : undefined };
}

// リクエスト相関ID
const rid = () => {
  try {
    // ts-expect-error: Node/Edge の差異を吸収
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export async function GET(req: Request) {
  const id = rid();
  const url = new URL(req.url);
  const shiftId = url.searchParams.get("shift_id");

  const log = (...a: unknown[]) => console.info("[/api/shift-records][GET]", id, ...a);
  const err = (...a: unknown[]) => console.error("[/api/shift-records][GET]", id, ...a);

  log("start", { path: url.pathname, qs: Object.fromEntries(url.searchParams.entries()) });

  if (!shiftId) {
    err("missing shift_id");
    return NextResponse.json({ error: "missing shift_id", rid: id }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin; // 互換エクスポート

    const columns = "id,status,updated_at"; // ← 最小構成

    log("select shift_records", { shiftId, columns });
    const { data, error } = await sb
      .from("shift_records")
      .select(columns)
      .eq("shift_id", shiftId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<ShiftRecordSelect>();

    if (error) {
      const pe = asPgError(error);
      err("supabase select error", pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, {
        status: 500,
        headers: { "x-debug-rid": id },
      });
    }

    if (!data) {
      log("not found");
      return NextResponse.json({ error: "not found", rid: id }, { status: 404, headers: { "x-debug-rid": id } });
    }

    const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
    log("ok", { record_id: data.id, status_db: data.status, status_api: out.status });
    return NextResponse.json(out, { headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = asPgError(e);
    err("exception", pe);
    return NextResponse.json({ error: pe.message ?? "internal error", rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}

export async function POST(req: Request) {
  const id = rid();
  const log = (...a: unknown[]) => console.info("[/api/shift-records][POST]", id, ...a);
  const err = (...a: unknown[]) => console.error("[/api/shift-records][POST]", id, ...a);

  // 1) JSON 受理
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    err("invalid json");
    return NextResponse.json({ error: "invalid json", rid: id }, { status: 400 });
  }

  // 2) 最小バリデーション（zod 無し）
  if (typeof raw !== "object" || raw === null) {
    err("invalid body shape");
    return NextResponse.json({ error: "invalid body", rid: id }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  const shift_id = typeof body.shift_id === "string" ? body.shift_id : ""; // uuid string を想定
  const statusDb = toDbStatus(body.status);

  log("payload", { shift_id, statusDb });

  if (!shift_id) {
    err("missing shift_id");
    return NextResponse.json({ error: "missing shift_id", rid: id }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id, status: statusDb })
      .select("id,status,updated_at")
      .single<ShiftRecordSelect>();

    if (error) {
      const pe = asPgError(error);
      err("supabase insert error", pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    const out = { id: data.id, status: toApiStatus(data.status), updated_at: data.updated_at };
    log("created", { record_id: data.id, status_db: data.status, status_api: out.status });
    return NextResponse.json(out, { status: 201, headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = asPgError(e);
    err("exception", pe);
    return NextResponse.json({ error: pe.message ?? "internal error", rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}
