// app/api/alert_log/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { AlertRow } from "@/types/alert_log";
import { PatchInput, Result, ok, err, isErr } from "@/types/alert_log";

// body サニタイズ
function sanitizePatchBody(body: unknown): Result<PatchInput> {
  if (typeof body !== "object" || body === null) return err("invalid body");
  const b = body as Record<string, unknown>;

  const out: PatchInput = {};

  if (typeof b.status === "string") {
    if (["open", "in_progress", "done", "muted", "cancelled"].includes(b.status)) {
      out.status = b.status as PatchInput["status"];
    } else {
      return err("invalid status");
    }
  }
  if (typeof b.status_source === "string") out.status_source = b.status_source;
  if (typeof b.assigned_to === "string" || b.assigned_to === null) out.assigned_to = (b.assigned_to as string) ?? null;
  if (typeof b.result_comment === "string") out.result_comment = b.result_comment;
  if (typeof b.auth_user_id === "string" || b.auth_user_id === null) out.auth_user_id = (b.auth_user_id as string) ?? null;

  return ok(out);
}

// DB更新オブジェクト構築
function buildUpdate(input: PatchInput): Partial<AlertRow> & Record<string, unknown> {
  const up: Partial<AlertRow> & Record<string, unknown> = {};
  if (input.status) up.status = input.status;
  if (input.status_source) up.status_source = input.status_source;
  if (input.assigned_to !== undefined) up.assigned_to = input.assigned_to;

  if (typeof input.result_comment === "string") {
    up.result_comment = input.result_comment;
    up.result_comment_at = new Date().toISOString();
    if (typeof input.auth_user_id === "string" && input.auth_user_id) {
      up.result_comment_by = input.auth_user_id;
    }
  }
  if (input.status === "done" && typeof input.auth_user_id === "string" && input.auth_user_id) {
    up.completed_by = input.auth_user_id;
  }
  return up;
}

export async function PATCH(
  req: Request,
  ctx: { params?: { id?: string } } // ← paramsの型を安全に
) {
  try {
    const idMaybe = ctx?.params?.id;
    const id = typeof idMaybe === "string" ? idMaybe : undefined;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const parsed = sanitizePatchBody(await req.json());
    if (isErr(parsed)) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const up = buildUpdate(parsed.value);
    if (Object.keys(up).length === 0) {
      return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("alert_log").update(up).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
