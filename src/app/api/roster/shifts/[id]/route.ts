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
  actor_user_id?: string; // ★ optional：送れるなら送る（監査用）
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
      !YMD.test(body.date ?? "")
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
      .select(
        "shift_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, two_person_work_flg"
      )
      .eq("shift_id", shiftId)
      .single();

    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }

    const cur = data as ShiftRow;

    // ② targetCol 決定（列名 or 元担当者IDの両対応）
    let targetCol: "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id" | null = null;

    // A) src_staff_id が列名で来る場合
    if (
      body.src_staff_id === "staff_01_user_id" ||
      body.src_staff_id === "staff_02_user_id" ||
      body.src_staff_id === "staff_03_user_id"
    ) {
      targetCol = body.src_staff_id;
    } else {
      // B) src_staff_id が「元担当者ID」で来る場合（値一致で特定）
      if (cur.staff_01_user_id === body.src_staff_id) targetCol = "staff_01_user_id";
      else if (cur.staff_02_user_id === body.src_staff_id) targetCol = "staff_02_user_id";
      else if (cur.staff_03_user_id === body.src_staff_id) targetCol = "staff_03_user_id";
    }

    // 列が特定できないなら “更新できない” ではなく明示エラーにする
    if (!targetCol) {
      return NextResponse.json(
        {
          error: "cannot detect target column",
          shift_id: shiftId,
          src_staff_id: body.src_staff_id,
          current: {
            staff_01_user_id: cur.staff_01_user_id,
            staff_02_user_id: cur.staff_02_user_id,
            staff_03_user_id: cur.staff_03_user_id,
          },
        },
        { status: 400 }
      );
    }

    // ③ 更新は RPC に一本化（ここだけ）
    const { error: rpcErr } = await SB.rpc("roster_patch_shift_with_context", {
      p_shift_id: shiftId,
      p_date: body.date,
      p_start: body.start_at,
      p_end: body.end_at,
      p_update_at: updateAt,
      p_target_col: targetCol,
      p_staff_id: body.staff_id,
      p_actor_user_id: body.actor_user_id ?? null, // ★ nullable
      p_request_path: requestPath ?? null,
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