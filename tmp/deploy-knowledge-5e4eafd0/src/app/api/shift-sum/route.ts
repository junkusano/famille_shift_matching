// src/app/api/shift-sum/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = { year_month: string };

function normalizeYM(ym: string) {
  const s = ym.trim();
  if (/^\d{6}$/.test(s)) return s; // 202507
  if (/^\d{4}-\d{2}$/.test(s)) return s.replace("-", ""); // 2025-07 -> 202507
  return null;
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function emailToUserIdText(email: string | undefined | null) {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  return email.slice(0, at); // junkusano@shi-on.net -> junkusano
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
    }

    // ✅ token を検証して user を確定（service role）
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;

    if (userErr || !user) {
      return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const ym = normalizeYM(body.year_month);
    if (!ym) {
      return NextResponse.json({ error: "年月の形式が不正です（YYYYMM）" }, { status: 400 });
    }

    // ✅ admin判定：まず uuid(id) を試す → ダメなら user_id(text) を試す
    let systemRole: string | null = null;

    // (A) users.id = auth uuid 方式（存在すればこれが最速）
    const { data: rowByUuid } = await supabaseAdmin
      .from("users")
      .select("system_role")
      .eq("id", user.id)
      .maybeSingle();

    if (rowByUuid?.system_role) systemRole = rowByUuid.system_role;

    // (B) users.user_id = "junkusano" 方式（あなたのログ上はこちらが本命）
    if (!systemRole) {
      const userIdText = emailToUserIdText(user.email);
      if (userIdText) {
        const { data: rowByText, error: rowByTextErr } = await supabaseAdmin
          .from("users")
          .select("system_role")
          .eq("user_id", userIdText)
          .maybeSingle();

        if (rowByTextErr) {
          return NextResponse.json({ error: "権限確認に失敗しました" }, { status: 500 });
        }
        if (rowByText?.system_role) systemRole = rowByText.system_role;
      }
    }

    if (!systemRole) {
      // ここに来るのは「users に紐づきが無い」ケース
      return NextResponse.json({ error: "権限確認に失敗しました" }, { status: 500 });
    }

    if (systemRole !== "admin") {
      return NextResponse.json({ error: "管理者のみ実行できます" }, { status: 403 });
    }

    // ✅ 再計算（service role）
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
