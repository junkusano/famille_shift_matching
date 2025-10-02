// /app/api/shift-custom-view/route.ts
// ShiftRecord が参照する「シフト詳細（表示用）API」
// - DB の実テーブル: public.shift（単数）
// - 補助ビュー: public.shift_csinfo_postalname_view（利用者名・郵便番号など）
//
// 【入参】GET /api/shift-custom-view?shift_id=...&expand=staff&client_name=...
//   - shift_id: 必須
//   - expand   : "staff" を含めるとスタッフ氏名を付与（IDは従来通り返却しつつ、full_nameを追加）
//   - client_name: カード側からのフォールバック（クエリ優先で採用）
//
// 【返却】200 OK
// {
//   shift_id, kaipoke_cs_id, service_code,
//   shift_start_date, shift_start_time, shift_end_date, shift_end_time,
//   staff_01_user_id, staff_02_user_id, staff_03_user_id,
//   head_shift_id,
//   // 表示用に追加（従来通り）
//   client_name, postal_code, postal_code_3, district,
//   // ★ expand=staff 時のみ追加
//   staff_01_full_name, staff_02_full_name, staff_03_full_name,
//   // 便利フィールド
//   shift_start_time_hm, shift_end_time_hm
// }
//
// NOTE:
// - RLS 有効でも Service Role Key を使うことで参照可能（サーバ限定）
// - SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL を環境変数に設定してください

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // リアルタイム性重視。ISR不要

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env is missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// DBの型は緩めに（差異に強く）
interface ShiftRow {
  shift_id: string;
  kaipoke_cs_id?: string | null;
  service_code?: string | null;
  shift_start_date?: string | null; // date
  shift_start_time?: string | null; // time
  shift_end_date?: string | null;   // date
  shift_end_time?: string | null;   // time
  staff_01_user_id?: string | null;
  staff_02_user_id?: string | null;
  staff_03_user_id?: string | null;
  head_shift_id?: string | null;
  // ★ フロント互換のため、ここに full_name を後付けで突ける（型は任意）
  [k: string]: any;
}

interface CsInfo {
  name?: string | null;
  postal_code?: string | null;
  postal_code_3?: string | null;
  district?: string | null;
}

interface UserNameRow {
  user_id: string;
  last_name_kanji?: string | null;
  first_name_kanji?: string | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shiftId = searchParams.get("shift_id");
  const expand = (searchParams.get("expand") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientNameFromQS = (searchParams.get("client_name") || "").trim(); // クエリ優先

  if (!shiftId) {
    return NextResponse.json({ error: "shift_id required" }, { status: 400 });
  }

  const supabase = getClient();

  // 1) シフト本体を取得（単数テーブル名: shift）
  const { data: s, error: e1 } = await supabase
    .from("shift")
    .select(
      [
        "shift_id",
        "kaipoke_cs_id",
        "service_code",
        "shift_start_date",
        "shift_start_time",
        "shift_end_date",
        "shift_end_time",
        "staff_01_user_id",
        "staff_02_user_id",
        "staff_03_user_id",
        "head_shift_id",
      ].join(",")
    )
    .eq("shift_id", shiftId)
    .maybeSingle<ShiftRow>();

  if (e1) {
    return NextResponse.json({ error: e1.message, code: e1.code ?? "DB_ERROR_1" }, { status: 500 });
  }
  if (!s) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // 2) 利用者名・郵便番号など（クエリ>補助ビュー>シフト行の順でフォールバック）
  let client_name = clientNameFromQS; // まずQSを優先
  let postal_code = "";
  let postal_code_3 = "";
  let district = "";

  if (!client_name && s.kaipoke_cs_id) {
    const { data: cs, error: e2 } = await supabase
      .from("shift_csinfo_postalname_view")
      .select("name, postal_code, postal_code_3, district")
      .eq("kaipoke_cs_id", s.kaipoke_cs_id)
      .maybeSingle<CsInfo>();

    if (!e2 && cs) {
      client_name = cs.name ?? client_name;
      postal_code = cs.postal_code ?? "";
      postal_code_3 = cs.postal_code_3 ?? "";
      district = cs.district ?? "";
    }
  }

  if (!client_name) {
    // shift テーブルに client_name / name 等があれば最後の保険で使う
    const rec = s as unknown as Record<string, unknown>;
    const cn = rec["client_name"];
    const nm = rec["name"];
    if (typeof cn === "string") client_name = cn;
    else if (typeof nm === "string") client_name = nm;
  }

  // 3) expand=staff：スタッフ氏名（漢字）を付与（IDは従来通り返却）
  let staff_01_full_name = undefined as string | undefined;
  let staff_02_full_name = undefined as string | undefined;
  let staff_03_full_name = undefined as string | undefined;

  if (expand.includes("staff")) {
    const ids = [
      s.staff_01_user_id,
      s.staff_02_user_id,
      s.staff_03_user_id,
    ]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    if (ids.length) {
      const unique = Array.from(new Set(ids));
      const { data: users, error: uerr } = await supabase
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji")
        .in("user_id", unique);

      if (!uerr && users) {
        const nameMap = Object.fromEntries(
          users.map((u: UserNameRow) => {
            const last = (u.last_name_kanji ?? "").trim();
            const first = (u.first_name_kanji ?? "").trim();
            const full = [last, first].filter(Boolean).join(" ");
            return [u.user_id, full];
          })
        ) as Record<string, string>;

        staff_01_full_name = s.staff_01_user_id ? (nameMap[s.staff_01_user_id] ?? "") : "";
        staff_02_full_name = s.staff_02_user_id ? (nameMap[s.staff_02_user_id] ?? "") : "";
        staff_03_full_name = s.staff_03_user_id ? (nameMap[s.staff_03_user_id] ?? "") : "";
      } else {
        // 取得失敗時は既存挙動を壊さないため、氏名は空文字で返す（ステータスは200のまま）
        staff_01_full_name = s.staff_01_user_id ? "" : "";
        staff_02_full_name = s.staff_02_user_id ? "" : "";
        staff_03_full_name = s.staff_03_user_id ? "" : "";
      }
    } else {
      // user_id が空なら氏名も空
      staff_01_full_name = "";
      staff_02_full_name = "";
      staff_03_full_name = "";
    }
  }

  // 返却直前で足す関数
  const toHHmm = (t?: string | null) =>
    typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : (t ?? "");

  // 4) 返却（表示テンプレが使いやすいキー名を含める）
  //    ★ expand=staff が無い場合は full_name フィールド自体を付けない（従来互換）
  const baseBody = {
    ...s,
    client_name,
    postal_code,
    postal_code_3,
    district,
    shift_start_time_hm: toHHmm(s.shift_start_time),
    shift_end_time_hm: toHHmm(s.shift_end_time),
  } as Record<string, any>;

  if (expand.includes("staff")) {
    baseBody.staff_01_full_name = staff_01_full_name ?? "";
    baseBody.staff_02_full_name = staff_02_full_name ?? "";
    baseBody.staff_03_full_name = staff_03_full_name ?? "";
  }

  return NextResponse.json(baseBody);
}
