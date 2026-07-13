import { google } from "googleapis";
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    /*
     * Google側で認証がキャンセルされた場合などは、
     * errorパラメータが返されます。
     */
    const googleError = searchParams.get("error");

    if (googleError) {
      return NextResponse.json(
        {
          ok: false,
          error: `Google認証が完了しませんでした: ${googleError}`,
        },
        { status: 400 },
      );
    }

    const code = searchParams.get("code");
    const returnedState = searchParams.get("state");
    const savedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

    if (!code) {
      return NextResponse.json(
        {
          ok: false,
          error: "Googleから認可コードが返されていません",
        },
        { status: 400 },
      );
    }

    /*
     * startで保存したstateと、Googleから返されたstateを比較します。
     */
    if (
      !returnedState ||
      !savedState ||
      returnedState !== savedState
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "OAuthのstateが一致しません。認証を最初からやり直してください",
        },
        { status: 400 },
      );
    }

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
     * Googleから返された認可コードを、
     * access_tokenとrefresh_tokenに交換します。
     */
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      const response = NextResponse.json(
        {
          ok: false,
          error:
            "refresh_tokenが返されませんでした。Googleアカウントの連携を解除してから、もう一度認証してください",
          accessTokenReceived: Boolean(tokens.access_token),
        },
        { status: 400 },
      );

      response.cookies.delete(OAUTH_STATE_COOKIE);
      return response;
    }

    /*
     * 初回セットアップ時だけ、refresh_tokenを画面に表示します。
     * 取得後はVercel環境変数に保存してください。
     *
     * 本番運用開始後は、refreshTokenをレスポンスへ含める処理を
     * 削除することを推奨します。
     */
    const response = NextResponse.json({
      ok: true,
      message:
        "Google認証に成功しました。refreshTokenを安全な場所へ保存してください。",
      refreshToken: tokens.refresh_token,
      scope: tokens.scope ?? null,
      expiryDate: tokens.expiry_date ?? null,
    });

    response.cookies.delete(OAUTH_STATE_COOKIE);

    return response;
  } catch (error) {
    console.error("[google-calendar/oauth/callback] error", error);

    const response = NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Google OAuthのコールバック処理に失敗しました",
      },
      { status: 500 },
    );

    response.cookies.delete(OAUTH_STATE_COOKIE);
    return response;
  }
}