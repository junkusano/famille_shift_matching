//api/auth/lineworks-2fa/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAuthClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function normalizeEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !password || !code) {
      return NextResponse.json(
        {
          ok: false,
          message: "メールアドレス・パスワード・認証コードを入力してください。",
        },
        { status: 400 }
      );
    }

    // 本ログイン前にID/PWを再確認
    const { data: signInData, error: signInError } =
      await supabaseAuthClient.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError || !signInData.user || !signInData.session) {
      return NextResponse.json(
        {
          ok: false,
          message: "メールアドレスまたはパスワードが正しくありません。",
        },
        { status: 401 }
      );
    }

    const authUserId = signInData.user.id;
    const codeHash = sha256(code);

    const { data: otpRow, error: otpError } = await supabaseAdmin
      .from("login_lineworks_otp")
      .select("id, auth_user_id, code_hash, expires_at, consumed_at, created_at")
      .eq("auth_user_id", authUserId)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (otpError) {
      console.error("[lineworks-2fa/verify] otp select error", otpError);
      return NextResponse.json(
        { ok: false, message: "認証コードの確認に失敗しました。" },
        { status: 500 }
      );
    }

    if (!otpRow) {
      return NextResponse.json(
        {
          ok: false,
          message: "認証コードが見つかりません。もう一度ログインからやり直してください。",
        },
        { status: 400 }
      );
    }

    const nowMs = Date.now();
    const expiresMs = new Date(otpRow.expires_at).getTime();

    if (Number.isNaN(expiresMs) || expiresMs < nowMs) {
      return NextResponse.json(
        {
          ok: false,
          message: "認証コードの有効期限が切れています。もう一度ログインしてください。",
        },
        { status: 400 }
      );
    }

    if (otpRow.code_hash !== codeHash) {
      return NextResponse.json(
        { ok: false, message: "認証コードが正しくありません。" },
        { status: 400 }
      );
    }

    const { error: consumeError } = await supabaseAdmin
      .from("login_lineworks_otp")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otpRow.id);

    if (consumeError) {
      console.error("[lineworks-2fa/verify] otp consume error", consumeError);
      return NextResponse.json(
        { ok: false, message: "認証コードの確定処理に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "認証に成功しました。",
      session: signInData.session,
    });
  } catch (e) {
    console.error("[lineworks-2fa/verify] unexpected error", e);
    return NextResponse.json(
      { ok: false, message: "認証コード確認中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}