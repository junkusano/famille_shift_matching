// /app/api/shift-custom-view/route.ts
// ShiftRecord が参照する「シフト詳細（表示用）API」
// - DB の実テーブル: public.shift（単数）
// - 補助ビュー: public.shift_csinfo_postalname_view（利用者名・郵便番号など）
//
// 【入参】GET /api/shift-custom-view?shift_id=...&expand=staff&client_name=...
//   - shift_id: 必須
//   - expand   : "staff" を含めると将来スタッフ展開に対応（現状はIDのまま返却）
//   - client_name: カード側からのフォールバック（クエリ優先で採用）
//
// 【返却】200 OK
// {
//   shift_id, kaipoke_cs_id, service_code,
//   shift_start_date, shift_start_time, shift_end_date, shift_end_time,
//   staff_01_user_id, staff_02_user_id, staff_03_user_id,
//   head_shift_id,
//   // 表示用に追加
//   client_name, postal_code, postal_code_3, district
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
}

interface CsInfo {
  name?: string | null;
  postal_code?: string | null;
  postal_code_3?: string | null;
  district?: string | null;
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

  // 3) expand=staff（将来拡張用）：いまは参照だけして未使用警告を回避
  if (expand.includes("staff")) {
    // ここにスタッフ名の解決処理を追加可能（現状はIDのまま返却）
  }

  // 4) 返却（表示テンプレが使いやすいキー名を含める）
  return NextResponse.json({
    ...s,
    client_name,
    postal_code,
    postal_code_3,
    district,
  });
}
