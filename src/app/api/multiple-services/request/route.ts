import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";
import { MULTIPLE_SERVICE_PREFIX } from "@/lib/multiple-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RequestBody = {
  shiftIds?: Array<number | string>;
  groupId?: string;
  attendRequest?: boolean;
  timeAdjustNote?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await getUserFromBearer(req);
    if (!auth.token || !auth.user?.id) {
      return NextResponse.json({ ok: false, error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await req.json()) as RequestBody;
    const shiftIds = Array.from(
      new Set(
        (body.shiftIds ?? [])
          .map((value) => Number(value))
          .filter((value) => Number.isSafeInteger(value) && value > 0),
      ),
    );
    const groupId = String(body.groupId ?? "");

    if (!groupId.startsWith(MULTIPLE_SERVICE_PREFIX) || shiftIds.length < 2) {
      return NextResponse.json({ ok: false, error: "複数サービスの申請内容が不正です" }, { status: 400 });
    }

    const { data: actor, error: actorError } = await supabaseAdmin
      .from("users")
      .select("user_id,kaipoke_user_id")
      .eq("auth_user_id", auth.user.id)
      .maybeSingle();
    if (actorError) throw new Error(actorError.message);
    if (!actor?.user_id) {
      return NextResponse.json({ ok: false, error: "職員情報を確認できません" }, { status: 403 });
    }

    const { data: rows, error: shiftError } = await supabaseAdmin
      .from("shift")
      .select("shift_id,shift_start_date,head_shift_id")
      .in("shift_id", shiftIds);
    if (shiftError) throw new Error(shiftError.message);

    if (
      (rows ?? []).length !== shiftIds.length ||
      (rows ?? []).some((row) => row.head_shift_id !== groupId) ||
      new Set((rows ?? []).map((row) => row.shift_start_date)).size !== 1
    ) {
      return NextResponse.json(
        { ok: false, error: "複数サービスの構成が更新されています。画面を再読込してください" },
        { status: 409 },
      );
    }

    const { data, error } = await supabaseAdmin.rpc("assign_user_to_multiple_service_v1", {
      p_shift_ids: shiftIds,
      p_user_id: String(actor.user_id),
      p_requester_id: auth.user.id,
      p_requested_kaipoke_user_id: actor.kaipoke_user_id ?? null,
      p_accompany: body.attendRequest === true,
      p_time_adjust_note: body.timeAdjustNote?.trim() || null,
    });

    if (error) {
      console.error("[multiple-services][request][rpc]", error);
      return NextResponse.json(
        { ok: false, error: error.message || "複数サービスをまとめて取得できませんでした" },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    console.error("[multiple-services][request]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "複数サービスをまとめて取得できませんでした" },
      { status: 500 },
    );
  }
}
