// src/app/api/shift-custom-view/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type ShiftRow = {
  id: string;
  client_name?: string | null;
  service_code?: string | null;
  shift_start_date?: string | null;   // "YYYY-MM-DD"
  shift_start_time?: string | null;   // "HH:mm" or "HH:mm:ss"
  shift_end_time?: string | null;     // "HH:mm" or "HH:mm:ss"
  staff_01_user_id?: string | null;
  staff_02_user_id?: string | null;
  staff_03_user_id?: string | null;
};

type UnitedViewRow = {
  user_id: string;
  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
  last_name_kana?: string | null;
  first_name_kana?: string | null;
};

const toHHmm = (t?: string | null) => (t ?? "").slice(0, 5);
const join3 = (a?: string, b?: string, c?: string) =>
  [a, b, c].map((x) => (x ? x.trim() : "")).filter(Boolean).join(" / ") || "—";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const shift_id = searchParams.get("shift_id");
    if (!shift_id) {
      return NextResponse.json({ error: "shift_id is required" }, { status: 400 });
    }

    const expand = new Set(
      (searchParams.get("expand") || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    // 1) シフト本体
    const { data: shift, error: e1 } = await supabaseAdmin
      .from("shifts")
      .select(
        [
          "id",
          "client_name",
          "service_code",
          "shift_start_date",
          "shift_start_time",
          "shift_end_time",
          "staff_01_user_id",
          "staff_02_user_id",
          "staff_03_user_id",
        ].join(",")
      )
      .eq("id", shift_id)
      .maybeSingle<ShiftRow>();

    if (e1) throw e1;
    if (!shift) return NextResponse.json({ error: "shift not found" }, { status: 404 });

    // 基本整形
    const startTime = toHHmm(shift.shift_start_time);
    const endTime = toHHmm(shift.shift_end_time);

    const payload: Record<string, unknown> = {
      shift_id: shift.id,
      client_name: shift.client_name ?? "",
      service_code: shift.service_code ?? "",
      shift_start_date: shift.shift_start_date ?? "",
      shift_start_time: startTime,
      shift_end_time: endTime,
      time_range:
        (shift.shift_start_date ? `${shift.shift_start_date} ` : "") +
        `${startTime} ~ ${endTime}`,
      staff_01_user_id: shift.staff_01_user_id ?? null,
      staff_02_user_id: shift.staff_02_user_id ?? null,
      staff_03_user_id: shift.staff_03_user_id ?? null,
    };

    // 2) expand=staff → 氏名（漢字/カナ）を一括解決
    if (expand.has("staff")) {
      const staffIds = [
        shift.staff_01_user_id,
        shift.staff_02_user_id,
        shift.staff_03_user_id,
      ].filter((v): v is string => !!v);

      const nameById: Record<string, { kanji: string; kana: string }> = {};

      if (staffIds.length) {
        const q = supabaseAdmin
          .from("user_entry_united_view_single")
          .select("user_id,last_name_kanji,first_name_kanji,last_name_kana,first_name_kana")
          .in("user_id", staffIds)
          .returns<UnitedViewRow[]>();

        const { data: rows, error: e2 } = await q;
        if (e2) throw e2;

        for (const u of rows ?? []) {
          const kanji = `${u.last_name_kanji ?? ""}${u.first_name_kanji ?? ""}`.trim();
          const kana = `${u.last_name_kana ?? ""}${u.first_name_kana ?? ""}`.trim();
          nameById[u.user_id] = { kanji: kanji || "", kana: kana || "" };
        }
      }

      const n1 = shift.staff_01_user_id ? nameById[shift.staff_01_user_id]?.kanji ?? "" : "";
      const n2 = shift.staff_02_user_id ? nameById[shift.staff_02_user_id]?.kanji ?? "" : "";
      const n3 = shift.staff_03_user_id ? nameById[shift.staff_03_user_id]?.kanji ?? "" : "";

      const k1 = shift.staff_01_user_id ? nameById[shift.staff_01_user_id]?.kana ?? "" : "";
      const k2 = shift.staff_02_user_id ? nameById[shift.staff_02_user_id]?.kana ?? "" : "";
      const k3 = shift.staff_03_user_id ? nameById[shift.staff_03_user_id]?.kana ?? "" : "";

      payload.staff_01_user_name = n1;
      payload.staff_02_user_name = n2;
      payload.staff_03_user_name = n3;
      payload.staff_names_joined = join3(n1, n2, n3);

      payload.staff_01_user_name_kana = k1;
      payload.staff_02_user_name_kana = k2;
      payload.staff_03_user_name_kana = k3;
      payload.staff_names_kana_joined = join3(k1, k2, k3);
    }

    return new NextResponse(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
