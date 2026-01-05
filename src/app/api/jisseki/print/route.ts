//api/jisseki/print/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type FormType = "TAKINO" | "KODO" | "DOKO" | "JYUHO" | "IDOU";

type PrintRow = {
  date: string;
  start: string;
  end: string;
  service_code?: string;
  minutes?: number;
  required_staff_count?: number;

  // ★IDOUで使用
  calc_hour?: number;                 // ⑤ 算定時間(時間)
  katamichi_addon?: 0 | 1;            // ⑥ 片道支援加算（0/1）
  cs_pay?: string | number;           // ⑦ 利用者負担額（insurance_unit_amount.cs_pay）
  staffNames?: string[];              // ⑧ サービス提供者名（複数）
};

type PrintForm = {
  formType: FormType;
  service_codes: string[];
  rows: PrintRow[];
};

type ShiftRow = {
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  required_staff_count: number | null;

  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

const toFormType = (serviceCode: string): FormType => {
  if (
    serviceCode === "移：必要不可欠な外出" ||
    serviceCode === "移：必要不可欠な外出（片道支援）" ||
    serviceCode === "移：その他の外出" ||
    serviceCode === "移：その他の外出（片道支援）"
  ) return "IDOU";

  if (serviceCode === "重訪Ⅱ" || serviceCode === "重訪Ⅲ") return "JYUHO";
  if (serviceCode === "行動援護") return "KODO";
  if (serviceCode.includes("同行")) return "DOKO";

  if (
    serviceCode === "身体" ||
    serviceCode === "家事" ||
    serviceCode === "通院(伴う)" ||
    serviceCode === "通院(伴ず)"
  ) return "TAKINO";

  return "TAKINO";
};

const calcMinutes = (startHHmm: string, endHHmm: string) => {
  const [sh, sm] = startHHmm.split(":").map(Number);
  const [eh, em] = endHHmm.split(":").map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return e >= s ? (e - s) : (e + 24 * 60 - s);
};

// ⑤：15分以上は30分(0.5h)単位で切り上げ
const calcHalfHourRoundedHours = (mins: number): number => {
  const base = Math.floor(mins / 30) * 0.5;
  const rem = mins % 30;
  return rem >= 15 ? base + 0.5 : base;
};

const ymToRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  return { start, end };
};

const isNagoyaZip = (zipRaw: string | null | undefined): boolean => {
  const z = (zipRaw ?? "").replace(/\D/g, ""); // 例: 4600001
  if (z.length < 3) return false;
  const head3 = Number(z.slice(0, 3));
  // 名古屋市: 450-459, 460-469 が中心 → 450〜469 で判定
  return Number.isFinite(head3) && head3 >= 450 && head3 <= 469;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const kaipoke_cs_id = searchParams.get("kaipoke_cs_id") ?? "";
  const month = searchParams.get("month") ?? ""; // YYYY-MM

  if (!kaipoke_cs_id || !month) {
    return NextResponse.json({ error: "kaipoke_cs_id, month は必須です" }, { status: 400 });
  }

  // 2025-11以降のみ
  if (month < "2025-11") {
    return NextResponse.json({
      client: { kaipoke_cs_id, client_name: "", ido_jukyusyasho: "", address_zip: "" },
      month,
      forms: [],
    });
  }

  const { start, end } = ymToRange(month);

  // ★①：利用者名と郵便番号（名古屋市判定用）を取得
  const { data: cs } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("kaipoke_cs_id,name,postal_code,ido_jukyusyasho")
    .eq("kaipoke_cs_id", kaipoke_cs_id)
    .maybeSingle();

  const client_name = cs?.name ?? "";
  const ido_jukyusyasho = (cs as { ido_jukyusyasho?: string } | null)?.ido_jukyusyasho ?? "";
  const address_zip = (cs as { postal_code?: string } | null)?.postal_code ?? "";

  // シフト取得（staff_01_user_id 追加）
  const { data: shifts, error } = await supabaseAdmin
    .from("shift")
    .select("shift_start_date,shift_start_time,shift_end_time,service_code,required_staff_count,staff_01_user_id,staff_02_user_id,staff_03_user_id")
    .eq("kaipoke_cs_id", kaipoke_cs_id)
    .gte("shift_start_date", start)
    .lte("shift_start_date", end)
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true })
    .returns<ShiftRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ★⑧：スタッフ氏名の辞書を作る
  const staffIds = Array.from(
    new Set(
      (shifts ?? [])
        .flatMap(s => [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id])
        .filter((v): v is string => !!v)
    )
  );

  const staffNameMap = new Map<string, string>();
  if (staffIds.length > 0) {
    type StaffViewRow = {
      user_id: string;
      last_name_kanji: string | null;
      first_name_kanji: string | null;
    };

    const { data: users } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("user_id,last_name_kanji,first_name_kanji")
      .in("user_id", staffIds);

    (users as StaffViewRow[] | null ?? []).forEach((u) => {
      const name = `${u.last_name_kanji ?? ""}${u.first_name_kanji ?? ""}`.trim();
      staffNameMap.set(u.user_id, name);
    });
  }

  // ★⑦：名古屋市なら insurance_unit_amount を引いて cal_hour=>cs_pay の辞書
  const insurer = isNagoyaZip(address_zip) ? "名古屋市" : null;
  const csPayByHour = new Map<number, string | number>();

  if (insurer) {
    const { data: units } = await supabaseAdmin
      .from("insurance_unit_amount")
      .select("cal_hour,cs_pay")
      .eq("insurer", insurer)
      .eq("insurance_kind", "移動支援");

    (units ?? []).forEach((u: { cal_hour?: number | null; cs_pay?: string | number | null }) => {
      if (typeof u.cal_hour === "number" && u.cs_pay != null) {
        csPayByHour.set(u.cal_hour, u.cs_pay);
      }
    });
  }

  const rows: PrintRow[] = (shifts ?? []).map((s: ShiftRow): PrintRow => {
    const startHHmm = (s.shift_start_time ?? "").slice(0, 5);
    const endHHmm = (s.shift_end_time ?? "").slice(0, 5);

    const minutes = startHHmm && endHHmm ? calcMinutes(startHHmm, endHHmm) : undefined;
    const calc_hour = typeof minutes === "number" ? calcHalfHourRoundedHours(minutes) : undefined;

    // ⑥ 片道支援加算判定（service_code と calc_hour を使う）
    const isKatamichiService =
      (s.service_code ?? "") === "移：必要不可欠な外出（片道支援）";
    const katamichi_addon: 0 | 1 =
      isKatamichiService && typeof calc_hour === "number" && calc_hour > 1.5 ? 1 : 0;

    // ⑧ staffNames（01/02/03 を氏名化）
    const staffNames = [
      s.staff_01_user_id ? staffNameMap.get(s.staff_01_user_id) ?? "" : "",
      s.staff_02_user_id ? staffNameMap.get(s.staff_02_user_id) ?? "" : "",
      s.staff_03_user_id ? staffNameMap.get(s.staff_03_user_id) ?? "" : "",
    ].filter((v) => v.trim().length > 0);

    // ⑦ 利用者負担額（名古屋市以外は空）
    const cs_pay =
      insurer && typeof calc_hour === "number"
        ? (csPayByHour.get(calc_hour) ?? "")
        : "";

    return {
      date: s.shift_start_date ?? "",
      start: startHHmm,
      end: endHHmm,
      service_code: s.service_code ?? "",
      minutes,
      required_staff_count: s.required_staff_count ?? 1,

      calc_hour,
      katamichi_addon, // ⑥
      cs_pay,          // ⑦
      staffNames,      // ⑧
    };
  });

  const map = new Map<FormType, { service_codes: Set<string>; rows: PrintRow[] }>();

  for (const r of rows) {
    const formType = toFormType(r.service_code ?? "");

    if (!map.has(formType)) {
      map.set(formType, { service_codes: new Set<string>(), rows: [] });
    }

    const bucket = map.get(formType)!;
    bucket.service_codes.add(r.service_code ?? "");
    bucket.rows.push(r);
  }

  const forms: PrintForm[] = Array.from(map.entries()).map(([formType, bucket]) => ({
    formType,
    service_codes: Array.from(bucket.service_codes),
    rows: bucket.rows,
  }));

  return NextResponse.json({
    client: { kaipoke_cs_id, client_name, ido_jukyusyasho, address_zip },
    month,
    forms,
  });
}
