import crypto from "crypto";
import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "google_calendar_oauth_state";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }

  return value;
}

export async function GET() {
  try {
    /*
     * この認証ルートを誰でも実行できないようにする、
     * 初回セットアップ用の簡易チェックです。
     *
     * 使用例:
     * /api/google-calendar/oauth/start?setup_secret=xxxxx
  
    const setupSecret = request.nextUrl.searchParams.get("setup_secret");
    const expectedSetupSecret = getRequiredEnv(
      "GOOGLE_CALENDAR_OAUTH_SETUP_SECRET",
    );

    if (!setupSecret || setupSecret !== expectedSetupSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "認証開始用のsetup_secretが正しくありません",
        },
        { status: 401 },
      );
    }
         */

    const clientId = getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID");
    const clientSecret = getRequiredEnv(
      "GOOGLE_CALENDAR_CLIENT_SECRET",
    );
    const redirectUri = getRequiredEnv(
      "GOOGLE_CALENDAR_REDIRECT_URI",
    );

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    /*
     * OAuthのCSRF対策用stateです。
     * callbackで同じ値か確認します。
     */
    const state = crypto.randomBytes(32).toString("hex");

    const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent select_account",
  scope: [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ],
  state,
  include_granted_scopes: true,
  login_hint: process.env.GOOGLE_CALENDAR_ACCOUNT,
});

    const response = NextResponse.redirect(authorizationUrl);

    /*
     * stateをHttpOnly Cookieに一時保存します。
     * OAuth完了後はcallback側で削除します。
     */
    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });

    return response;
  } catch (error) {
    console.error("[google-calendar/oauth/start] error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google OAuthの開始に失敗しました",
      },
      { status: 500 },
    );
  }
}