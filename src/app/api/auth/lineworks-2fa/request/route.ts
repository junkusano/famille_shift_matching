//api/auth/lineworks-2fa/request/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRUSTED_DEVICE_COOKIE_NAME = "trusted_device";

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

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

async function getRecruitContact() {
  const { data, error } = await supabaseAdmin
    .from("env_variables")
    .select("group_key, key_name, value")
    .eq("group_key", "saiyou")
    .in("key_name", ["saiyou_tantou", "saiyou_phone"]);

  if (error) {
    console.error("[lineworks-2fa/request] env_variables error", error);
    return {
      tantou: "採用担当者",
      phone: "",
    };
  }

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.key_name), String(row.value ?? ""));
  }

  return {
    tantou: map.get("saiyou_tantou") || "採用担当者",
    phone: map.get("saiyou_phone") || "",
  };
}

async function findTrustedDevice(req: NextRequest, authUserId: string) {
  const rawToken = req.cookies.get(TRUSTED_DEVICE_COOKIE_NAME)?.value?.trim() ?? "";
  if (!rawToken) return null;

  const tokenHash = sha256(rawToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("login_trusted_devices")
    .select("id, auth_user_id, expires_at, revoked_at")
    .eq("auth_user_id", authUserId)
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error) {
    console.error("[lineworks-2fa/request] trusted device lookup error", error);
    return null;
  }

  return data ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: "メールアドレスとパスワードを入力してください。" },
        { status: 400 }
      );
    }

    // 1) ID/PWを確認する
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

    // 1.5) trusted device ならOTP省略
    const trustedDevice = await findTrustedDevice(req, authUserId);
    if (trustedDevice) {
      await supabaseAdmin
        .from("login_trusted_devices")
        .update({
          last_used_at: new Date().toISOString(),
          last_ip: getClientIp(req) || null,
          user_agent: req.headers.get("user-agent") || null,
        })
        .eq("id", trustedDevice.id);

      return NextResponse.json({
        ok: true,
        skipTwoFactor: true,
        message: "この端末では追加認証を省略しました。",
        session: signInData.session,
      });
    }

    const recruit = await getRecruitContact();

    // 2) LINE WORKS 送信先取得
    const { data: staff, error: staffError } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("auth_user_id, user_id, channel_id, last_name_kanji, first_name_kanji")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (staffError) {
      console.error("[lineworks-2fa/request] staff lookup error", staffError);
    }

    const channelId = String(staff?.channel_id ?? "").trim();

    if (!channelId) {
      return NextResponse.json(
        {
          ok: false,
          code: "LINEWORKS_CHANNEL_NOT_FOUND",
          message:
            `LINE WORKS の連携先が見つかりませんでした。\n` +
            `先に LINE WORKS の登録を行うか、${recruit.tantou}${recruit.phone ? `（${recruit.phone}）` : ""} までお問い合わせください。`,
        },
        { status: 400 }
      );
    }

    // 3) OTP発行
    const otp = generateCode();
    const otpHash = sha256(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("login_lineworks_otp")
      .delete()
      .eq("auth_user_id", authUserId)
      .is("consumed_at", null);

    const { error: insertError } = await supabaseAdmin
      .from("login_lineworks_otp")
      .insert({
        auth_user_id: authUserId,
        email,
        code_hash: otpHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error("[lineworks-2fa/request] otp insert error", insertError);
      return NextResponse.json(
        { ok: false, message: "認証コードの発行に失敗しました。" },
        { status: 500 }
      );
    }

    // 4) LINE WORKS に送信
    try {
      const accessToken = await getAccessToken();

      const name =
        `${staff?.last_name_kanji ?? ""}${staff?.first_name_kanji ?? ""}`.trim() ||
        "スタッフ";

      const text =
        `【マイ・ファミーユ ログイン認証】\n` +
        `${name}さん\n\n` +
        `認証コードは ${otp} です。\n` +
        `有効期限は10分です。\n` +
        `このコードをマイ・ファミーユのログイン画面に入力してください。`;

      await sendLWBotMessage(channelId, text, accessToken);
    } catch (e) {
      console.error("[lineworks-2fa/request] lineworks send error", e);

      return NextResponse.json(
        {
          ok: false,
          code: "LINEWORKS_SEND_FAILED",
          message:
            `LINE WORKS に認証コードを送信できませんでした。\n` +
            `先に LINE WORKS の登録を行うか、${recruit.tantou}${recruit.phone ? `（${recruit.phone}）` : ""} までお問い合わせください。`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      skipTwoFactor: false,
      message: "LINE WORKS に認証コードを送信しました。コードを入力してください。",
    });
  } catch (e) {
    console.error("[lineworks-2fa/request] unexpected error", e);
    return NextResponse.json(
      { ok: false, message: "認証コード送信処理でエラーが発生しました。" },
      { status: 500 }
    );
  }
}