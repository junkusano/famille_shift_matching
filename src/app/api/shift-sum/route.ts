// src/app/api/shift-sum/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = { year_month: string };

function normalizeYM(ym: string) {
  const s = ym.trim();
  if (/^\d{6}$/.test(s)) return s; // 202507
  if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", ""); // 2025-07 -> 202507
  return null;
}

export async function POST(req: Request) {
  try {
    // ✅ cookieセッションで「誰が押したか」判定するためのクライアント
    const supabase = createRouteHandlerClient({ cookies });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const ym = normalizeYM(body.year_month);
    if (!ym) {
      return NextResponse.json({ error: "年月の形式が不正です（YYYYMM）" }, { status: 400 });
    }

    // ✅ admin判定：users.id（uuid） = auth.user.id 前提
    // たぶんあなたの構造はこれが正しい（audit_log viewで u.user_id(text) を表示名に使ってた）
    const { data: userRow, error: userErr } = await supabaseAdmin
      .from("users")
      .select("system_role")
      .eq("id", user.id)
      .single();

    if (userErr) {
      return NextResponse.json({ error: "権限確認に失敗しました" }, { status: 500 });
    }

    if (userRow?.system_role !== "admin") {
      return NextResponse.json({ error: "管理者のみ実行できます" }, { status: 403 });
    }

    // ✅ Service RoleでRPC（スナップショット作成）
    const { data, error } = await supabaseAdmin.rpc("snapshot_biz_stats_shift_sum", {
      p_year_month: ym,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, affected: data ?? null }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "unexpected error" }, { status: 500 });
  }
}
