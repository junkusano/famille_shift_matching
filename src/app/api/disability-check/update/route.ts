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
    // 1) Bearer token 優先
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    let authUserId: string | null = null;

    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (!error && data?.user?.id) {
        authUserId = data.user.id;
      }
    }

    // 2) Bearer で取れない場合のみ Cookie フォールバック
    if (!authUserId) {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: auth } = await supabase.auth.getUser();
      authUserId = auth.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // ★修正：system_role を確認（single優先→fallback）
    const { data: me1, error: me1Err } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("system_role")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (me1Err) {
      console.error("[disability-check] role fetch error (single)", me1Err);
      return NextResponse.json({ error: "role_fetch_failed" }, { status: 500 });
    }

    let systemRole: string | null = me1?.system_role ?? null;

    if (!systemRole) {
      const { data: me2, error: me2Err } = await supabaseAdmin
        .from("user_entry_united_view")
        .select("system_role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

      if (me2Err) {
        console.error("[disability-check] role fetch error (view)", me2Err);
        return NextResponse.json({ error: "role_fetch_failed" }, { status: 500 });
      }

      systemRole = me2?.system_role ?? null;
    }

    const role = String(systemRole ?? "").trim().toLowerCase();
    const isAdmin = role === "admin" || role === "super_admin";
    const isManager = isAdmin || role.includes("manager");

    // ★回収✅の更新（check）だけ、マネージャー以外は拒否
    // ※ handleCheckChange は { check: boolean, ... } を送る前提
    const isCheckUpdate = typeof check === "boolean";
    if (isCheckUpdate && !isManager) {
      return NextResponse.json(
        { error: "forbidden", detail: "manager_only", role },
        { status: 403 }
      );
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