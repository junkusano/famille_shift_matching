import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type FormType = "TAKINO" | "KODO" | "DOKO" | "JYUHO" | "IDOU";

type PrintRow = {
    date: string;  // YYYY-MM-DD
    start: string; // HH:mm
    end: string;   // HH:mm
    service_code?: string;            // ★追加：分類・表示用途
    minutes?: number;              // ★追加：サービス提供分（計画時間数算出に使用）
    required_staff_count?: number; // ★追加：派遣人数（shift.required_staff_count）
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
};

const toFormType = (serviceCode: string): FormType => {
    // 移動支援
    if (
        serviceCode === "移：必要不可欠な外出" ||
        serviceCode === "移：必要不可欠な外出（片道支援）" ||
        serviceCode === "移：その他の外出" ||
        serviceCode === "移：その他の外出（片道支援）"
    ) return "IDOU" as const;

    // 重訪
    if (serviceCode === "重訪Ⅱ" || serviceCode === "重訪Ⅲ") return "JYUHO" as const;

    // 行動援護
    if (serviceCode === "行動援護") return "KODO" as const;

    // 同行援護
    if (serviceCode.includes("同行")) return "DOKO" as const;

    // 居宅介護（身体・家事・通院）
    if (
        serviceCode === "身体" ||
        serviceCode === "家事" ||
        serviceCode === "通院(伴う)" ||
        serviceCode === "通院(伴ず)"
    ) return "TAKINO" as const;

    // 未対応は居宅に寄せる/または Unknown で返す（運用に合わせて）
    return "TAKINO" as const;
};

const calcMinutes = (startHHmm: string, endHHmm: string) => {
    const [sh, sm] = startHHmm.split(":").map(Number);
    const [eh, em] = endHHmm.split(":").map(Number);

    const s = sh * 60 + sm;
    const e = eh * 60 + em;

    // 日跨ぎ（end <= start）も考慮
    const diff = e >= s ? (e - s) : (e + 24 * 60 - s);
    return diff;
};

const ymToRange = (ym: string) => {
    // ym: "2025-12"
    const [y, m] = ym.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = new Date(y, m, 0).getDate(); // 月末日
    const end = `${y}-${String(m).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
    return { start, end };
};

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const kaipoke_cs_id = searchParams.get("kaipoke_cs_id") ?? "";
    const month = searchParams.get("month") ?? ""; // YYYY-MM

    if (!kaipoke_cs_id || !month) {
        return NextResponse.json({ error: "kaipoke_cs_id, month は必須です" }, { status: 400 });
    }

    const { start, end } = ymToRange(month);

    // 利用者名（取得元はプロジェクトの実テーブルに合わせて調整）
    // 例：kaipoke_cs テーブルがある想定。無ければ disability_check_view などから拾う。
    const { data: cs } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id,name")
        .eq("kaipoke_cs_id", kaipoke_cs_id)
        .maybeSingle();

    const client_name = cs?.name ?? ""; // 見つからなければ空でOK（IDはどこにも入れない）

    // シフト取得（テーブル名が shift / shifts どちらかはプロジェクトに合わせて調整）
    const { data: shifts, error } = await supabaseAdmin
        .from("shift")
        .select("shift_start_date,shift_start_time,shift_end_time,service_code,required_staff_count")
        .eq("kaipoke_cs_id", kaipoke_cs_id)
        .gte("shift_start_date", start)
        .lte("shift_start_date", end)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .returns<ShiftRow[]>(); // ★追加：shifts の型を確定

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows: PrintRow[] = (shifts ?? []).map((s: ShiftRow): PrintRow => {
        const start = (s.shift_start_time ?? "").slice(0, 5);
        const end = (s.shift_end_time ?? "").slice(0, 5);

        const minutes =
            start && end
                ? calcMinutes(start, end)
                : undefined;

        return {
            date: s.shift_start_date ?? "",
            start,
            end,
            service_code: s.service_code ?? "",
            minutes,
            required_staff_count: s.required_staff_count ?? 1,
        };
    });

    // formType別にまとめる
    const map = new Map<FormType, { service_codes: Set<string>; rows: PrintRow[] }>();

    for (const r of rows) {
        const formType = toFormType(r.service_code);

        if (!map.has(formType)) {
            map.set(formType, { service_codes: new Set<string>(), rows: [] });
        }

        const bucket = map.get(formType)!;
        bucket.service_codes.add(r.service_code);
        bucket.rows.push({
            date: r.date,
            start: r.start,
            end: r.end,
            service_code: r.service_code,
            minutes: r.minutes,
            required_staff_count: r.required_staff_count,
        });
    }

    const forms: PrintForm[] = Array.from(map.entries()).map(([formType, bucket]) => ({
        formType,
        service_codes: Array.from(bucket.service_codes),
        rows: bucket.rows,
    }));

    const payload = {
        client: { kaipoke_cs_id, client_name },
        month,
        forms,
    };

    return NextResponse.json(payload);

}
