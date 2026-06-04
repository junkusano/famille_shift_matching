import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  auditId?: string;
  changeReason?: string | null;
  penaltyLevel?: string | null;
  actorUserIdText?: string | null; // user_id
};

const ALLOWED_LEVELS = ["", "minor", "moderate", "severe"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    const auditId = String(body.auditId ?? "").trim();
    if (!auditId) {
      return NextResponse.json({ error: "auditId is required" }, { status: 400 });
    }

    const penaltyLevel = String(body.penaltyLevel ?? "").trim();

    if (!ALLOWED_LEVELS.includes(penaltyLevel)) {
      return NextResponse.json(
        { error: "invalid penaltyLevel" },
        { status: 400 }
      );
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "env_not_configured" }, { status: 500 });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let actorAuthUserId: string | null = null;

    if (body.actorUserIdText && body.actorUserIdText.trim()) {
      const { data: actorRow, error: actorError } = await admin
        .from("user_entry_united_view_single")
        .select("auth_user_id")
        .eq("user_id", body.actorUserIdText.trim())
        .maybeSingle();

      if (actorError) {
        return NextResponse.json({ error: actorError.message }, { status: 500 });
      }

      if (!actorRow?.auth_user_id) {
        return NextResponse.json(
          { error: "actor user not found" },
          { status: 404 }
        );
      }

      actorAuthUserId = actorRow.auth_user_id;
    }

    const updatePayload: {
      change_reason: string | null;
      penalty_level: string | null;
      actor_user_id?: string | null;
    } = {
      change_reason: body.changeReason ?? null,
      penalty_level: penaltyLevel === "" ? null : penaltyLevel,
    };

    if (body.actorUserIdText !== undefined) {
      updatePayload.actor_user_id = actorAuthUserId;
    }

    const { data, error } = await admin
      .from("audit_log")
      .update(updatePayload)
      .eq("id", auditId)
      .select("id, actor_user_id, change_reason, penalty_level")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}