// src/app/api/shift-records/[id]/route.ts

import { supabaseAdmin } from "@/lib/supabase/service";

// PATCH で受け付けるフィールドを明示
type ShiftRecordPatch = {
  status?: string;     // text 列（'draft' | 'done' など）
  shift_id?: number;   // int8
  created_by?: string; // uuid
};

// 判別可能ユニオン型（ok=true / ok=false）
type PickResult =
  | { ok: true; value: ShiftRecordPatch }
  | { ok: false; msg: string };

// 型ガード
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// unknown から ShiftRecordPatch へ安全に絞り込む
function pickPatch(input: unknown): PickResult {
  if (!isRecord(input)) return { ok: false, msg: "body must be an object" };

  const out: ShiftRecordPatch = {};

  if ("status" in input) {
    const s = (input as Record<string, unknown>).status;
    if (typeof s !== "string") return { ok: false, msg: "status must be string" };
    out.status = s;
  }

  if ("shift_id" in input) {
    const n = (input as Record<string, unknown>).shift_id;
    if (typeof n !== "number" || !Number.isFinite(n))
      return { ok: false, msg: "shift_id must be number" };
    out.shift_id = n;
  }

  if ("created_by" in input) {
    const u = (input as Record<string, unknown>).created_by;
    if (typeof u !== "string")
      return { ok: false, msg: "created_by must be uuid string" };
    out.created_by = u;
  }

  if (Object.keys(out).length === 0)
    return { ok: false, msg: "no updatable fields in body" };

  return { ok: true, value: out };
}

// ★ Next.js 15 では Web 標準の Request を使う（NextRequest は使わない）
export async function PATCH(
  req: Request,
  context: { params: { id: string } } // ← ここはこの形でOK（独自型を import しない）
): Promise<Response> {
  const id = context.params.id;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("invalid json body", { status: 400 });
  }

  const picked = pickPatch(raw);
  // 判別は 'in' を使って環境差を回避
  if ("msg" in picked) {
    return new Response(`bad request: ${picked.msg}`, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("shift_records")
    .update(picked.value)        // ← ShiftRecordPatch 型に絞り込み済み
    .eq("id", id)
    .select("id,status,updated_at")
    .single();

  if (error) {
    return new Response(
      `update failed: ${error.message}${
        error.details ? " | " + error.details : ""
      }${error.hint ? " | " + error.hint : ""}`,
      { status: 400 }
    );
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
