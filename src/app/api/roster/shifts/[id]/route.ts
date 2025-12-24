// src/app/api/roster/shifts/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// 入力（DnD確定時のPATCHペイロード）
type PatchBody = {
  src_staff_id: string;   // 触った枠の“元”担当者（列の特定に使用）
  staff_id: string;       // 変更後の担当者（= dst）
  start_at: string;       // "HH:mm"
  end_at: string;         // "HH:mm"
  date: string;           // "YYYY-MM-DD"
  actor_user_id: string;  // ★追加：ログインユーザーのUUID（フロントから送る）
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
    // /api/roster/shifts/:id から id を抽出（単一引数運用）
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
      !YMD.test(body.date ?? "") ||
      !body.actor_user_id
    ) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // 「どのページから」箱（まずは referer の pathname）
    const referer = req.headers.get("referer") ?? "";
    const requestPath = referer
      ? new URL(referer).pathname
      : "/portal/roster/daily";

    // shift.update_at は timestamp without time zone 想定
    const nowTs = new Date();
    const updateAt = nowTs.toISOString().slice(0, 19).replace("T", " "); // 'YYYY-MM-DD HH:mm:ss'

    // ① 現在の担当スロットを取得
    const { data, error: selErr } = await SB
      .from("shift")
      .select("shift_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, two_person_work_flg")
      .eq("shift_id", shiftId)
      .single();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const cur = data as ShiftRow;

    // ② どの列（01/02/03）に src_staff_id が入っていたか？
    // ② どの列（01/02/03）を触ったか？
    //    src_staff_id は「列名（staff_01_user_id等）」でも「元の担当者ID」でも来る可能性があるので両対応
    let targetCol: "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id" | null = null;

    if (
      body.src_staff_id === "staff_01_user_id" ||
      body.src_staff_id === "staff_02_user_id" ||
      body.src_staff_id === "staff_03_user_id"
    ) {
      targetCol = body.src_staff_id;
    } else {
      // 値（元担当者ID）で来る場合
      if (cur.staff_01_user_id === body.src_staff_id) targetCol = "staff_01_user_id";
      else if (cur.staff_02_user_id === body.src_staff_id) targetCol = "staff_02_user_id";
      else if (cur.staff_03_user_id === body.src_staff_id) targetCol = "staff_03_user_id";
    }


    // ③ 更新は RPC に一本化（ここだけ）
    const { error: rpcErr } = await SB.rpc("roster_patch_shift_with_context", {
      p_shift_id: shiftId,
      p_date: body.date,
      p_start: body.start_at,
      p_end: body.end_at,
      p_update_at: updateAt,
      p_target_col: targetCol,                 // null or 'staff_01_user_id' ...
      p_staff_id: body.staff_id,
      p_actor_user_id: body.actor_user_id,     // ← フロントから
      p_request_path: requestPath,
    });

    if (rpcErr) {
      const code = (rpcErr as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "unique violation on (kaipoke_cs_id, shift_start_date, shift_start_time, required_staff_count)" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
