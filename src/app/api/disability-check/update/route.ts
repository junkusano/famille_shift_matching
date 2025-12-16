//api/disability-check/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type Body = {
  check: boolean;
  submitted?: boolean;
  year_month: string;
  kaipoke_servicek: string;
  kaipoke_cs_id: string;
};

export async function PUT(req: NextRequest) {
  try {
    const { check, submitted, year_month, kaipoke_servicek, kaipoke_cs_id } =
      (await req.json()) as Body;

    // ★追加：ログインユーザーを取得（Cookieベース）
    const supabase = createRouteHandlerClient({ cookies });
    const { data: auth } = await supabase.auth.getUser();

    const authUserId = auth.user?.id;
    if (!authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ★追加：system_role を確認
    const { data: me, error: meErr } = await supabaseAdmin
      .from("user_entry_united_view")
      .select("system_role")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (meErr) {
      console.error("[disability-check] role fetch error", meErr);
      return NextResponse.json({ error: "role_fetch_failed" }, { status: 500 });
    }

    const role = String(me?.system_role ?? "").toLowerCase();
    const isManager = role === "manager" || role === "admin";

    // ★回収✅の更新（check）だけ、マネージャー以外は拒否
    // ※ handleCheckChange は { check: boolean, ... } を送る前提
    const isCheckUpdate = typeof check === "boolean";
    if (isCheckUpdate && !isManager) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // どの項目を更新するかを組み立てる
    const row: {
      kaipoke_cs_id: string;
      year_month: string;
      kaipoke_servicek: string;
      is_checked?: boolean;
      application_check?: boolean;
    } = {
      kaipoke_cs_id,
      year_month,
      kaipoke_servicek,
    };

    // 回収チェック（is_checked）を更新する場合
    if (typeof check === "boolean") {
      row.is_checked = check;
    }

    // 提出チェック（application_check）を更新する場合
    if (typeof submitted === "boolean") {
      row.application_check = submitted;
    }

    // どちらも入っていないリクエストはエラー
    if (row.is_checked === undefined && row.application_check === undefined) {
      return NextResponse.json(
        { error: "no_update_field" },
        { status: 400 }
      );
    }

    // 複合キーで upsert（障害/移動支援のユニーク制約に準拠）
    const { error } = await supabaseAdmin
      .from("disability_check")
      .upsert([row], {
        onConflict: "kaipoke_cs_id,year_month,kaipoke_servicek",
      });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[disability-check] upsert error", e);
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }
}