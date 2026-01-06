//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  yearMonth: string;
  kaipokeServicek: string;
  districts?: string[];

  // ★追加：URLクエリ/フロントから渡す
  staffId?: string | null;         // user_id（実績担当者）
  kaipoke_cs_id?: string | null;   // 利用者（kaipoke_cs_id）
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
    const {
      yearMonth,
      kaipokeServicek,
      districts = [],
      staffId: staffIdReq = null,
      kaipoke_cs_id: csReq = null,
    } = (await req.json()) as Body;

    // ★追加：ログインユーザーを確定（ここが無いと改ざんされる）
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ★追加：ログインユーザーの role と user_id を取得（RLSが効くクライアントで読む）
    const { data: me, error: meErr } = await supabase
      .from("user_entry_united_view")
      .select("system_role,user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (meErr || !me?.user_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const role = String(me.system_role ?? "").toLowerCase();
    const isManager = role === "manager" || role === "admin";
    const myUserId = String(me.user_id);

    // ★最重要：実績担当者（user_id）をサーバ側で強制確定
    // - 非マネージャー：必ず自分
    // - マネージャー：リクエストの staffId を採用（未指定なら全て）
    const effectiveStaffId = isManager ? (staffIdReq || "") : myUserId;

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

    if (districts.length > 0) {
      query = query.in("district", districts);
    }

    // ★追加：利用者（kaipoke_cs_id）で絞り込み
    if (csReq) {
      query = query.eq("kaipoke_cs_id", csReq);
    }

    // ★最重要：担当者（非マネージャーは必ず自分に固定）
    if (effectiveStaffId) {
      query = query.eq("asigned_jisseki_staff_id", effectiveStaffId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows: ViewRow[] = (data ?? []) as unknown as ViewRow[];

    const targetCsIds = Array.from(new Set(rows.map((r) => r.kaipoke_cs_id))).filter(Boolean);

    let dcQuery = supabaseAdmin
      .from("disability_check")
      .select("kaipoke_cs_id,year_month,kaipoke_servicek,application_check")
      .eq("year_month", yearMonth);

    if (kaipokeServicek) {
      dcQuery = dcQuery.eq("kaipoke_servicek", kaipokeServicek);
    }

    if (targetCsIds.length > 0) {
      dcQuery = dcQuery.in("kaipoke_cs_id", targetCsIds);
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
