// src/app/api/roster/shifts/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// 入力（DnD確定時のPATCHペイロード）
// ※ フロント側で "src_staff_id" を必ず送ること（触った枠の元担当ID）
//    body = { src_staff_id, staff_id, start_at, end_at, date }

type PatchBody = {
  src_staff_id: string;  // 触った枠の“元”担当者（列の特定に使用）
  staff_id: string;      // 変更後の担当者（= dst）
  start_at: string;      // "HH:mm"
  end_at: string;        // "HH:mm"
  date: string;          // "YYYY-MM-DD"
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

    // 現在の担当スロットを取得
    const { data, error: selErr } = await SB
      .from("shift")
      .select("shift_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, two_person_work_flg")
      .eq("shift_id", shiftId)
      .single();

    if (selErr || !data) {
      return NextResponse.json({ error: "shift not found" }, { status: 404 });
    }

    const cur = data as ShiftRow;

    // どの列（01/02/03）に src_staff_id が入っていたか？
    let targetCol: "staff_01_user_id" | "staff_02_user_id" | "staff_03_user_id" | null = null;
    if (cur.staff_01_user_id === body.src_staff_id) targetCol = "staff_01_user_id";
    else if (cur.staff_02_user_id === body.src_staff_id) targetCol = "staff_02_user_id";
    else if (cur.staff_03_user_id === body.src_staff_id) targetCol = "staff_03_user_id";

    // 更新カラム（テーブル定義に合わせる）
    const updateCols: {
      shift_start_date: string;
      shift_start_time: string;
      shift_end_time: string;
      update_at: string;
      staff_01_user_id?: string | null;
      staff_02_user_id?: string | null;
      staff_03_user_id?: string | null;
    } = {
      shift_start_date: body.date,     // date
      shift_start_time: body.start_at, // time without time zone
      shift_end_time: body.end_at,     // time without time zone
      update_at: new Date().toISOString(), // timestamp without time zone
    };

    // 触った枠だけを置換（列が特定できない場合は時間のみ更新）
    if (targetCol) {
      updateCols[targetCol] = body.staff_id;
    }

    const { error: updErr } = await SB
      .from("shift")
      .update(updateCols)
      .eq("shift_id", shiftId);

    if (updErr) {
      // 一意制約（(kaipoke_cs_id, shift_start_date, shift_start_time)）衝突など
      // Postgres error code 23505 = unique_violation
      const code = (updErr as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json(
          { error: "unique violation on (kaipoke_cs_id, shift_start_date, shift_start_time)" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
