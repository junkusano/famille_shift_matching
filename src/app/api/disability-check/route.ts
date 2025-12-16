//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  yearMonth: string;
  kaipokeServicek: string;
  districts?: string[];
};

type DisabilityCheckRow = {
  kaipoke_cs_id: string;
  year_month: string;
  kaipoke_servicek: string;
  application_check: boolean | null;
};

type ViewRow = {
  kaipoke_cs_id: string;
  year_month: string;
  kaipoke_servicek: string;
  client_name: string | null;
  ido_jukyusyasho: string | null;
  is_checked: boolean | null;
  district: string | null;
  asigned_jisseki_staff_id: string | null;
  asigned_jisseki_staff_name: string | null;
  asigned_org_id: string | null;
  asigned_org_name: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { yearMonth, kaipokeServicek, districts = [] } = (await req.json()) as Body;

    let query = supabaseAdmin
      .from("disability_check_view")
      .select(
        [
          "kaipoke_cs_id",
          "year_month",
          "kaipoke_servicek",
          "client_name",
          "ido_jukyusyasho",
          "is_checked",
          "district",

          // ★ 追加（実績担当者）
          "asigned_jisseki_staff_id",
          "asigned_jisseki_staff_name",
          "asigned_org_id",
          "asigned_org_name",
        ].join(",")
      )
      .eq("year_month", yearMonth)
      .order("district", { ascending: true })
      .order("client_name", { ascending: true });

     if (kaipokeServicek) {
      query = query.eq("kaipoke_servicek", kaipokeServicek);
    }

    // ★ 地域指定があるときだけ（← これで警告が消える）
    if (districts.length > 0) {
      query = query.in("district", districts);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows: ViewRow[] = (data ?? []) as unknown as ViewRow[];

    let dcQuery = supabaseAdmin
      .from("disability_check")
      .select("kaipoke_cs_id,year_month,kaipoke_servicek,application_check")
      .eq("year_month", yearMonth);

    // ★追加：サービスが指定されているときだけ絞り込み
    if (kaipokeServicek) {
      dcQuery = dcQuery.eq("kaipoke_servicek", kaipokeServicek);
    }

    const { data: dcRows, error: dcError } = await dcQuery;
    if (dcError) throw dcError;


    // ③ (cs_id,年月,サービス種別) → application_check のマップを作成
    const submittedMap = new Map<string, boolean | null>();
    (dcRows ?? []).forEach((r) => {
      const row = r as DisabilityCheckRow;
      const key = `${row.kaipoke_cs_id}__${row.year_month}__${row.kaipoke_servicek}`;
      submittedMap.set(key, row.application_check);
    });

    const merged = rows.map((r: ViewRow) => {
      const key = `${r.kaipoke_cs_id}__${r.year_month}__${r.kaipoke_servicek}`;
      const submitted = submittedMap.get(key) ?? null;

      return {
        ...r,
        is_submitted: submitted,
      };
    });

    return NextResponse.json(merged);
  } catch (e) {
    console.error("[disability-check] fetch error", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
