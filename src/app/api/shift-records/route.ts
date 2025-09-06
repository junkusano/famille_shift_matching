// src/app/api/shift-records/route.ts

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";        // Supabase Admin は Node 実行を推奨
export const dynamic = "force-dynamic"; // キャッシュさせない

// --- 型（最小限・このファイルだけで自己完結） ---
export type ShiftStatus = "入力中" | "完了" | (string & {});
export type ShiftRecordSelect = {
  id: string;
  status: ShiftStatus;
  client_name: string | null;
  updated_at: string | null; // timestamp
  // DB に values 列が無い環境もあるため optional とする
  values?: unknown;
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
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export async function GET(req: Request) {
  const id = rid();
  const url = new URL(req.url);
  const shiftId = url.searchParams.get("shift_id");
  const debug = url.searchParams.get("_debug") === "1";

  const log = (...a: unknown[]) => console.info("[/api/shift-records][GET]", id, ...a);
  const err = (...a: unknown[]) => console.error("[/api/shift-records][GET]", id, ...a);

  log("start", { path: url.pathname, qs: Object.fromEntries(url.searchParams.entries()) });

  if (!shiftId) {
    err("missing shift_id");
    return NextResponse.json({ error: "missing shift_id", rid: id }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin; // 互換エクスポート：関数呼びにしている場合は supabaseAdmin()

    // values 列が無い場合は下の columns から "values" を外してください
    const columns = "id,status,client_name,updated_at,values";

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

    log("ok", { record_id: data.id, status: data.status });
    return NextResponse.json(data, {
      headers: { "x-debug-rid": id, ...(debug ? { "x-sql-select": columns } : {}) },
    });
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
  const shift_id = typeof body.shift_id === "string" ? body.shift_id : "";
  const status = body.status === "完了" ? "完了" : "入力中"; // それ以外は既定で「入力中」
  const client_name = typeof body.client_name === "string" ? body.client_name : body.client_name === null ? null : null;

  log("payload", { shift_id, status, has_client_name: client_name != null });

  if (!shift_id) {
    err("missing shift_id");
    return NextResponse.json({ error: "missing shift_id", rid: id }, { status: 400 });
  }

  // 3) 追加：必要なら重複を回避（DB に UNIQUE(shift_id) があると堅い）
  try {
    const sb = supabaseAdmin;
    const { data, error } = await sb
      .from("shift_records")
      .insert({ shift_id, status, client_name })
      .select("id,status")
      .single<{ id: string; status: ShiftStatus }>();

    if (error) {
      const pe = asPgError(error);
      err("supabase insert error", pe);
      return NextResponse.json({ error: pe.message, code: pe.code, rid: id }, { status: 500, headers: { "x-debug-rid": id } });
    }

    log("created", { record_id: data?.id, status: data?.status });
    return NextResponse.json(data, { status: 201, headers: { "x-debug-rid": id } });
  } catch (e: unknown) {
    const pe = asPgError(e);
    err("exception", pe);
    return NextResponse.json({ error: pe.message ?? "internal error", rid: id }, { status: 500, headers: { "x-debug-rid": id } });
  }
}
