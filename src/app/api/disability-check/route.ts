//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  yearMonth: string;
  kaipokeServicek: string;
  districts?: string[];

  // ★追加：URLクエリ/フロントから渡す
  staffId?: string | null;         // user_id（実績担当者）
  kaipoke_cs_id?: string | null;   // 利用者（kaipoke_cs_id）
};

type ViewRow = {
  kaipoke_cs_id: string;
  year_month: string;
  kaipoke_servicek: string;
  client_name: string | null;
  client_kana: string | null; // ★追加
  ido_jukyusyasho: string | null;
  shogai_jukyusha_no: string | null;
  is_checked: boolean | null;
  district: string | null;
  asigned_jisseki_staff_id: string | null;
  asigned_jisseki_staff_name: string | null;
  asigned_org_id: string | null;
  asigned_org_name: string | null;
  application_check: boolean | null; // ★追加（viewに追加した提出）
};

type CsKaipokeInfoRow = {
  kaipoke_cs_id: string;
  kana: string | null;
  shogai_jukyusha_no: string | null;
};

// GET メソッドを追加
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ error: "month パラメータが必要です" }, { status: 400 });
    }

    // 一括印刷用のデータを取り出す処理
    // ここで実際にlocalStorageのデータを取得しても良いが、今回は GET パラメータから月だけ取得
    return new NextResponse(
      `
        <!DOCTYPE html>
        <html>
          <head>
            <title>実績記録票 一括印刷</title>
            <meta charset="utf-8" />
          </head>
          <body>
            <div id="root"></div>
            <script>
              // フロントエンドのJSコード
              const payload = localStorage.getItem("jisseki_bulk_print");
              if (payload) {
                const data = JSON.parse(payload);
                // 必要なデータで一括印刷を処理
              }
            </script>
          </body>
        </html>
      `,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (e) {
    console.error("エラー:", e);
    return NextResponse.json({ error: "内部サーバーエラー" }, { status: 500 });
  }
}

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
    // 1) Authorization Bearer からトークン取得
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // 2) トークンから user を特定（supabaseAdmin で検証）
    if (!token) {
      return NextResponse.json({ error: "unauthorized:no_token" }, { status: 401 });
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userRes?.user;

    if (userErr || !user) {
      return NextResponse.json(
        { error: "unauthorized:bad_token", detail: userErr?.message ?? null },
        { status: 401 }
      );
    }

    // 3) role と user_id を取得（フロントと同じ view に揃えるのが安全）
    // 3) role と user_id を取得（複数行でも落ちないように 1行に決め打ち）
    let me: { system_role: string | null; user_id: string | null } | null = null;

    // 3-1) まず single view を優先（基本は1行のはず）
    {
      const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("system_role,user_id")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[disability-check] role(single) error", error);
      }
      if (data?.user_id) me = data;
    }

    // 3-2) single が取れない場合だけ、united_view から 1件だけ拾う（複数行でも落ちない）
    if (!me?.user_id) {
      const { data, error } = await supabaseAdmin
        .from("user_entry_united_view")
        .select("system_role,user_id")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[disability-check] role(view) error", error);
      }
      if (data?.user_id) me = data;
    }

    if (!me?.user_id) {
      return NextResponse.json(
        { error: "forbidden:no_role", detail: "role row not found" },
        { status: 403 }
      );
    }

    const role = String(me.system_role ?? "").trim().toLowerCase();

    const isAdmin = role === "admin" || role === "super_admin";
    const isManager = isAdmin || role.includes("manager"); // senior_manager 等も拾う
    const isMember = !isManager; // ★要件：member=自分のみ / manager・admin=全件

    const myUserId = String(me.user_id);

    // ★要件：member=自分のみ / manager・admin=全件（＝絞り込み無し）
    let query = supabaseAdmin
      .from("disability_check_view")
      .select(
        [
          "kaipoke_cs_id",
          "year_month",
          "kaipoke_servicek",
          "client_name",
          "client_kana",
          "ido_jukyusyasho",
          "is_checked",
          "district",
          "asigned_jisseki_staff_id",
          "asigned_jisseki_staff_name",
          "asigned_org_id",
          "asigned_org_name",
          "application_check",
        ].join(",")
      )
      .eq("year_month", yearMonth)
      // ★ 必ずこの中に入れる
      .in("kaipoke_servicek", ["障害", "移動支援"]);

    if (kaipokeServicek) query = query.eq("kaipoke_servicek", kaipokeServicek);
    if (districts.length > 0) query = query.in("district", districts);

    // 利用者（cs）での任意絞り込み
    if (csReq) query = query.eq("kaipoke_cs_id", csReq);

    const { data, error } = await query;
    if (error) throw error;

    let rows: ViewRow[] = (data ?? []) as unknown as ViewRow[];

    /* =========================
   ★追加：shift_service_code の区分で利用者を絞り込む
   - kaipoke_servicek が「障害」「移動支援」の service_code を持つ利用者だけ
   ========================= */

    const allowedServiceKs = kaipokeServicek
      ? [kaipokeServicek] // 画面で「障害」or「移動支援」を選んでいるならそれに合わせる
      : ["障害", "移動支援"]; // 念のため未指定でもこの2区分に限定

    // 1) 許可された service_code を取得
    const { data: sscRows, error: sscErr } = await supabaseAdmin
      .from("shift_service_code")
      .select("service_code, kaipoke_servicek")
      .in("kaipoke_servicek", allowedServiceKs);

    if (sscErr) throw sscErr;

    const allowedServiceCodes = Array.from(
      new Set((sscRows ?? []).map((r) => String(r.service_code ?? "").trim()).filter(Boolean))
    );

    // 設定が空なら「何も出さない」（誤表示防止）
    if (allowedServiceCodes.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // 2) 対象月の範囲を作る（YYYY-MM-01 〜 次月1日未満）
    const monthStart = `${yearMonth}-01`;
    const [yStr, mStr] = yearMonth.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const monthEndExclusive = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`;

    // 3) 対象月に「許可service_code」で入っている利用者を抽出
    const { data: shiftRows, error: shiftErr } = await supabaseAdmin
      .from("shift")
      .select("kaipoke_cs_id, service_code, shift_start_date")
      .gte("shift_start_date", monthStart)
      .lt("shift_start_date", monthEndExclusive)
      .in("service_code", allowedServiceCodes);

    if (shiftErr) throw shiftErr;

    const allowedCsIdSet = new Set(
      (shiftRows ?? [])
        .map((r) => (r.kaipoke_cs_id ? String(r.kaipoke_cs_id) : ""))
        .filter(Boolean)
    );

    // 4) disability_check_view の結果を「許可利用者」のみに絞る
    // rows を絞り込み
    rows = rows.filter((r) => allowedCsIdSet.has(String(r.kaipoke_cs_id)));

    type ShiftStaffPick = {
      staffCol: string;
      rows: Array<{ kaipoke_cs_id: string | null; staff_id: string | null }>;
    };

    async function fetchShiftStaffRows(args: {
      monthStart: string;
      monthEndExclusive: string;
      allowedServiceCodes: string[];
    }): Promise<ShiftStaffPick> {
      const staffCols = ["staff_user_id", "user_id", "staff_id", "worker_user_id", "caregiver_user_id"] as const;

      for (const staffCol of staffCols) {
        const { data, error } = await supabaseAdmin
          .from("shift")
          .select(`kaipoke_cs_id,${staffCol}`)
          .gte("shift_start_date", args.monthStart)
          .lt("shift_start_date", args.monthEndExclusive)
          .in("service_code", args.allowedServiceCodes);

        if (error) continue;

        return {
          staffCol,
          rows: (data ?? []).map((r) => {
            const rec = r as Record<string, unknown>;
            return {
              kaipoke_cs_id: (rec.kaipoke_cs_id as string | null) ?? null,
              staff_id: (rec[staffCol] as string | null) ?? null,
            };
          }),
        };
      }
      return { staffCol: "(none)", rows: [] };
    }

    // 1) shift から (cs_id, staff_id) を集計して最多staffを決める
    const { rows: shiftStaffRows } = await fetchShiftStaffRows({ monthStart, monthEndExclusive, allowedServiceCodes });

    const counts = new Map<string, Map<string, number>>();
    for (const r of shiftStaffRows) {
      const csId = (r.kaipoke_cs_id ?? "").toString();
      const staffId = (r.staff_id ?? "").toString();
      if (!csId || !staffId) continue;
      let m1 = counts.get(csId);
      if (!m1) { m1 = new Map(); counts.set(csId, m1); }
      m1.set(staffId, (m1.get(staffId) ?? 0) + 1);
    }

    const bestStaffByCs = new Map<string, string>();
    for (const [csId, m1] of counts.entries()) {
      let bestId = ""; let bestCnt = -1;
      for (const [staffId, cnt] of m1.entries()) {
        if (cnt > bestCnt) { bestCnt = cnt; bestId = staffId; }
      }
      if (bestId) bestStaffByCs.set(csId, bestId);
    }

    // 2) staff の表示名（last+first）と所属を view から取得
    const bestStaffIds = Array.from(new Set(Array.from(bestStaffByCs.values())));
    const staffInfoMap = new Map<string, { name: string; org_unit_id: string | null; orgunitname: string | null }>();
    if (bestStaffIds.length > 0) {
      const { data: staffInfos } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji,org_unit_id,orgunitname")
        .in("user_id", bestStaffIds);

      (staffInfos ?? []).forEach((r) => {
        const rec = r as Record<string, unknown>;
        const id = String(rec.user_id ?? "").trim();
        if (!id) return;
        const name = `${String(rec.last_name_kanji ?? "")}${String(rec.first_name_kanji ?? "")}`.trim() || id;
        staffInfoMap.set(id, {
          name,
          org_unit_id: (rec.org_unit_id as string | null) ?? null,
          orgunitname: (rec.orgunitname as string | null) ?? null,
        });
      });
    }

    // 3) disability_check_view の NULL を埋める
    const assignedRows: ViewRow[] = rows.map((r) => {
      if (r.asigned_jisseki_staff_id) return r;
      const best = bestStaffByCs.get(String(r.kaipoke_cs_id));
      if (!best) return r;
      const info = staffInfoMap.get(best);
      return {
        ...r,
        asigned_jisseki_staff_id: best,
        asigned_jisseki_staff_name: info?.name ?? r.asigned_jisseki_staff_name ?? null,
        asigned_org_id: info?.org_unit_id ?? r.asigned_org_id ?? null,
        asigned_org_name: info?.orgunitname ?? r.asigned_org_name ?? null,
      };
    });

    // 4) member/admin/manager のフィルタは「割当後」にかける
    let visibleRows = assignedRows;
    if (isMember) {
      visibleRows = visibleRows.filter((r) => r.asigned_jisseki_staff_id === myUserId);
    } else {
      if (staffIdReq) visibleRows = visibleRows.filter((r) => r.asigned_jisseki_staff_id === staffIdReq);
    }

    // ★重要：ここを追加（visibleRows を最終結果に反映）
    rows = visibleRows;

    // ★重要：targetCsIds も rows 更新後に作り直す（かな取得対象がズレない）
    const targetCsIds = Array.from(new Set(rows.map((r) => r.kaipoke_cs_id))).filter(Boolean);

    // ★追加：かな（よみがな）と shogai_jukyusha_no を cs_kaipoke_info から取得
    const kanaMap = new Map<string, string | null>();
    const shogaiMap = new Map<string, string | null>();

    if (targetCsIds.length > 0) {
      const { data: csRows, error: csErr } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id,kana,shogai_jukyusha_no")
        .in("kaipoke_cs_id", targetCsIds);

      if (csErr) throw csErr;

      (csRows ?? []).forEach((r) => {
        const row = r as CsKaipokeInfoRow;
        if (!row.kaipoke_cs_id) return;

        kanaMap.set(row.kaipoke_cs_id, row.kana);
        shogaiMap.set(row.kaipoke_cs_id, row.shogai_jukyusha_no);
      });
    }

    // ★追加：同一CS内で「どれかtrue」を集約（同じyearMonthで取ってるのでcs_idだけでOK）。
    const submittedAnyByCs = new Map<string, boolean>();
    for (const r of rows) {
      const csId = String(r.kaipoke_cs_id);
      const cur = submittedAnyByCs.get(csId) ?? false;
      const next = cur || r.application_check === true;
      submittedAnyByCs.set(csId, next);
    }

    const merged = rows.map((r: ViewRow) => {
      const csId = String(r.kaipoke_cs_id);
      const isSubmitted = submittedAnyByCs.get(csId) ?? false;

      const shogaiNo = (shogaiMap.get(csId) ?? "").trim();
      const idoNo = (r.ido_jukyusyasho ?? "").trim();
      const kana = (kanaMap.get(csId) ?? r.client_kana ?? "").trim();

      return {
        ...r,
        client_kana: kana || null,
        shogai_jukyusha_no: shogaiNo || null,
        ido_jukyusyasho: idoNo || null,
        is_submitted: isSubmitted,
        application_check: isSubmitted,
      };
    });

    return NextResponse.json(merged);
  } catch (e) {
    console.error("[disability-check] fetch error", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
