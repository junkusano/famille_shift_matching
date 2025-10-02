// /app/api/shift-custom-view/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase env is missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// --- DB行の型（テーブル: public.shift）
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

// --- 補助ビューの型
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

// --- レスポンスに追加されるフィールド（full_name は expand=staff 時のみ付与）
type ShiftResponse = ShiftRow & {
  client_name: string;
  postal_code: string;
  postal_code_3: string;
  district: string;
  shift_start_time_hm: string | null;
  shift_end_time_hm: string | null;
  staff_01_full_name?: string;
  staff_02_full_name?: string;
  staff_03_full_name?: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shiftId = searchParams.get("shift_id");
  const expand = (searchParams.get("expand") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const clientNameFromQS = (searchParams.get("client_name") || "").trim();

  if (!shiftId) {
    return NextResponse.json({ error: "shift_id required" }, { status: 400 });
  }

  const supabase = getClient();

  // 1) シフト本体
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

  // 2) 利用者名・郵便番号など（QS > 補助ビュー > shift 行）
  let client_name = clientNameFromQS;
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
    const rec = s as unknown as Record<string, unknown>;
    const cn = rec["client_name"];
    const nm = rec["name"];
    if (typeof cn === "string") client_name = cn;
    else if (typeof nm === "string") client_name = nm;
  }

  // 3) expand=staff：氏名付与（IDは従来通り返却）
  let staff_01_full_name: string | undefined;
  let staff_02_full_name: string | undefined;
  //let staff_3_full_name_unused_guard: unknown; // 使わない変数の警告回避は不要なら削除可
  let staff_03_full_name: string | undefined;

  if (expand.includes("staff")) {
    const ids = [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    if (ids.length) {
      const unique = Array.from(new Set(ids));
      const { data: users } = await supabase
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji")
        .in("user_id", unique);

      const nameMap: Record<string, string> = Object.fromEntries(
        (users ?? []).map((u: UserNameRow) => {
          const last = (u.last_name_kanji ?? "").trim();
          const first = (u.first_name_kanji ?? "").trim();
          return [u.user_id, [last, first].filter(Boolean).join(" ")];
        })
      );

      staff_01_full_name = s.staff_01_user_id ? (nameMap[s.staff_01_user_id] ?? "") : "";
      staff_02_full_name = s.staff_02_user_id ? (nameMap[s.staff_02_user_id] ?? "") : "";
      staff_03_full_name = s.staff_03_user_id ? (nameMap[s.staff_03_user_id] ?? "") : "";
    } else {
      staff_01_full_name = "";
      staff_02_full_name = "";
      staff_03_full_name = "";
    }
  }

  // 4) 返却
  const toHHmm = (t?: string | null) =>
    typeof t === "string" && t.length >= 5 ? t.slice(0, 5) : (t ?? null);

  const baseBody: ShiftResponse = {
    ...s,
    client_name,
    postal_code,
    postal_code_3,
    district,
    shift_start_time_hm: toHHmm(s.shift_start_time),
    shift_end_time_hm: toHHmm(s.shift_end_time),
    // full_name は expand=staff のときだけ値が入る（オプショナル）
    ...(expand.includes("staff")
      ? {
          staff_01_full_name,
          staff_02_full_name,
          staff_03_full_name,
        }
      : {}),
  };

  return NextResponse.json(baseBody);
}
