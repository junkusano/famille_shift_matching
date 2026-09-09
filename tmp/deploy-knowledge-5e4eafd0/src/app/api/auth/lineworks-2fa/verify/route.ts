//api/auth/lineworks-2fa/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUSTED_DEVICE_COOKIE_NAME = "trusted_device";
const TRUSTED_DEVICE_MAX_AGE_SEC = 60 * 60 * 24 * 14; // 14日

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

function generateTrustedDeviceToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

function buildDeviceName(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();

  const browser =
    ua.includes("edg/")
      ? "Edge"
      : ua.includes("chrome/")
        ? "Chrome"
        : ua.includes("safari/") && !ua.includes("chrome/")
          ? "Safari"
          : ua.includes("firefox/")
            ? "Firefox"
            : "Browser";

  const os =
    ua.includes("iphone") || ua.includes("ipad")
      ? "iOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("windows")
          ? "Windows"
          : ua.includes("mac os x")
            ? "macOS"
            : ua.includes("linux")
              ? "Linux"
              : "Unknown";

  return `${os} / ${browser}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const rememberDevice = body?.rememberDevice === true;

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

    const res = NextResponse.json({
      ok: true,
      message: "認証に成功しました。",
      session: signInData.session,
    });

    if (rememberDevice) {
      const rawToken = generateTrustedDeviceToken();
      const tokenHash = sha256(rawToken);
      const userAgent = req.headers.get("user-agent") || null;
      const ip = getClientIp(req) || null;
      const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SEC * 1000).toISOString();

      // 同一端末で再登録された場合のため、同一user + token_hashはupsert感覚で扱う
      const { error: trustedInsertError } = await supabaseAdmin
        .from("login_trusted_devices")
        .insert({
          auth_user_id: authUserId,
          token_hash: tokenHash,
          device_name: buildDeviceName(userAgent ?? ""),
          user_agent: userAgent,
          last_ip: ip,
          expires_at: expiresAt,
          last_used_at: new Date().toISOString(),
        });

      if (trustedInsertError) {
        console.error("[lineworks-2fa/verify] trusted device insert error", trustedInsertError);
        // trusted device 保存失敗でもログイン自体は成功扱い
        return res;
      }

      res.cookies.set({
        name: TRUSTED_DEVICE_COOKIE_NAME,
        value: rawToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: TRUSTED_DEVICE_MAX_AGE_SEC,
      });
    }

    return res;
  } catch (e) {
    console.error("[lineworks-2fa/verify] unexpected error", e);
    return NextResponse.json(
      { ok: false, message: "認証コード確認中にエラーが発生しました。" },
      { status: 500 }
    );
  }
}