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
          "ido_jukyusyasho",
          "is_checked",
          "district",
          "asigned_jisseki_staff_id",
          "asigned_jisseki_staff_name",
          "asigned_org_id",
          "asigned_org_name",
        ].join(",")
      )
      .eq("year_month", yearMonth);

    if (kaipokeServicek) query = query.eq("kaipoke_servicek", kaipokeServicek);
    if (districts.length > 0) query = query.in("district", districts);

    // 利用者（cs）での任意絞り込み
    if (csReq) query = query.eq("kaipoke_cs_id", csReq);

    // 権限による強制絞り込み
    if (isMember) {
      // member は必ず自分のみ（リクエストで staffId が来ても無視）
      query = query.eq("asigned_jisseki_staff_id", myUserId);
    } else {
      // manager/admin は任意で担当者絞り込み可能
      if (staffIdReq) query = query.eq("asigned_jisseki_staff_id", staffIdReq);
    }

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
    rows = rows.filter((r) => allowedCsIdSet.has(String(r.kaipoke_cs_id)));

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
