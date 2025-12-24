// src/app/api/roster/shifts/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as SB } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

type PatchBody = {
  src_staff_id: string;
  staff_id: string;
  start_at: string; // "HH:mm"
  end_at: string;   // "HH:mm"
  date: string;     // "YYYY-MM-DD"
};

type ShiftRow = {
  shift_id: number;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  two_person_work_flg: boolean;
};

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: Request) {
  try {
    // Auth（ログインユーザー）
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const actorUserIdText = userData?.user?.id ?? null; // UUID文字列 or null

    // shift_id
    const url = new URL(req.url);
    const seg = url.pathname.split("/");
    const idStr = seg[seg.length - 1];
    const shiftId = Number(idStr);
    if (!Number.isFinite(shiftId)) {
      return NextResponse.json({ error: "invalid shift id" }, { status: 400 });
    }

    const body: PatchBody = await req.json();
    if (
      !body?.src_staff_id ||
      !body?.staff_id ||
      !HHMM.test(body.start_at ?? "") ||
      !HHMM.test(body.end_at ?? "") ||
      !YMD.test(body.date ?? "")
    ) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // referer → pathname
    const referer = req.headers.get("referer") ?? "";
    const requestPath = referer ? new URL(referer).pathname : "/portal/roster/daily";

    // update_at（timestamp without time zone 文字列）
    const nowTs = new Date();
    const updateAt = nowTs.toISOString().slice(0, 19).replace("T", " ");

    // 現在のスロット取得
    const { data, error: selErr } = await SB
      .from("shift")
      .select("shift_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, two_person_work_flg")
      .eq("shift_id", shiftId)
      .single();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    const cur = data as ShiftRow;

    // targetCol（列名 or 値）
    let targetCol: "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id" | null = null;

    if (
      body.src_staff_id === "staff_01_user_id" ||
      body.src_staff_id === "staff_02_user_id" ||
      body.src_staff_id === "staff_03_user_id"
    ) {
      targetCol = body.src_staff_id;
    } else {
      if (cur.staff_01_user_id === body.src_staff_id) targetCol = "staff_01_user_id";
      else if (cur.staff_02_user_id === body.src_staff_id) targetCol = "staff_02_user_id";
      else if (cur.staff_03_user_id === body.src_staff_id) targetCol = "staff_03_user_id";
    }

    if (!targetCol) {
      return NextResponse.json(
        {
          error: "cannot detect target column",
          shift_id: shiftId,
          src_staff_id: body.src_staff_id,
        },
        { status: 400 }
      );
    }

    // ===== まずRPC（監査コンテキスト付き）を試す =====
    console.log("[roster] actorUserIdText", actorUserIdText);
    console.log("[roster] requestPath", requestPath);

    const { error: rpcErr } = await SB.rpc("roster_patch_shift_with_context", {
      p_shift_id: shiftId,
      p_date: body.date,
      p_start: body.start_at,
      p_end: body.end_at,
      p_update_at: updateAt,
      p_target_col: targetCol,
      p_staff_id: body.staff_id,
      p_actor_user_id: actorUserIdText, // ← ここで入れる
      p_request_path: requestPath,
    });

    if (!rpcErr) {
      return NextResponse.json({ ok: true });
    }

    // ===== RPC失敗時はフォールバック（業務停止を回避）=====
    console.error("rpcErr fallback:", rpcErr);

    const updateCols: {
      shift_start_date: string;
      shift_start_time: string;
      shift_end_time: string;
      update_at: string;
      staff_01_user_id?: string | null;
      staff_02_user_id?: string | null;
      staff_03_user_id?: string | null;
    } = {
      shift_start_date: body.date,
      shift_start_time: body.start_at,
      shift_end_time: body.end_at,
      update_at: updateAt, // ★ shiftは timestamp without time zone
    };
    updateCols[targetCol] = body.staff_id;

    const { error: updErr } = await SB
      .from("shift")
      .update(updateCols)
      .eq("shift_id", shiftId);

    if (updErr) {
      const code = (updErr as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "unique violation on (kaipoke_cs_id, shift_start_date, shift_start_time, required_staff_count)" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: updErr }, { status: 500 });
    }

    return NextResponse.json({ ok: true, warn: "rpc failed; fallback update used" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
