// src/app/api/roster/shifts/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin as SB } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type PatchBody = {
  staff_id: string;   // 画面から来るスタッフID
  start_at: string;   // "HH:mm"
  end_at: string;     // "HH:mm"
  date: string;       // "YYYY-MM-DD"
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
    // /api/roster/shifts/:id から id 抽出（引数は単一）
    const url = new URL(req.url);
    const seg = url.pathname.split("/");
    const idStr = seg[seg.length - 1];
    const shiftId = Number(idStr);
    if (!Number.isFinite(shiftId)) {
      return NextResponse.json({ error: "invalid shift id" }, { status: 400 });
    }

    const body: PatchBody = await req.json();
    if (!body?.staff_id || !HHMM.test(body.start_at) || !HHMM.test(body.end_at) || !YMD.test(body.date)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }

    // 必要カラムだけ取得（★ジェネリクスは使わない）
    const { data, error: selErr } = await SB
      .from("shift")
      .select("shift_id, staff_01_user_id, staff_02_user_id, staff_03_user_id, two_person_work_flg")
      .eq("shift_id", shiftId)
      .single();

    if (selErr || !data) {
      return NextResponse.json({ error: "shift not found" }, { status: 404 });
    }
    const cur = data as ShiftRow;

    // 既にどこかのスロットにいるか？
    const in01 = cur.staff_01_user_id === body.staff_id;
    const in02 = cur.staff_02_user_id === body.staff_id;
    const in03 = cur.staff_03_user_id === body.staff_id;

    // 更新カラム（テーブル型に揃える）
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
      update_at: new Date().toISOString(),
    };

    // 未所属なら空きに詰める（01 → 02 → 03、02/03は two_person_work_flg のときのみ）
    if (!(in01 || in02 || in03)) {
      if (!cur.staff_01_user_id) {
        updateCols.staff_01_user_id = body.staff_id;
      } else if (cur.two_person_work_flg && !cur.staff_02_user_id) {
        updateCols.staff_02_user_id = body.staff_id;
      } else if (cur.two_person_work_flg && !cur.staff_03_user_id) {
        updateCols.staff_03_user_id = body.staff_id;
      } else {
        // すべて埋まっていれば01を差し替え（必要に応じて仕様変更可）
        updateCols.staff_01_user_id = body.staff_id;
      }
    }

    const { error: updErr } = await SB.from("shift").update(updateCols).eq("shift_id", shiftId);
    if (updErr) {
      // 一意制約（(kaipoke_cs_id, shift_start_date, shift_start_time)）衝突など
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
