import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }

  return value;
}

export async function GET() {
  try {
    const clientId = getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID");
    const clientSecret = getRequiredEnv(
      "GOOGLE_CALENDAR_CLIENT_SECRET",
    );
    const redirectUri = getRequiredEnv(
      "GOOGLE_CALENDAR_REDIRECT_URI",
    );
    const refreshToken = getRequiredEnv(
      "GOOGLE_CALENDAR_REFRESH_TOKEN",
    );

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const calendar = google.calendar({
      version: "v3",
      auth: oauth2Client,
    });

    const result = await calendar.calendarList.list({
      minAccessRole: "reader",
      maxResults: 250,
    });

    const calendars = (result.data.items ?? []).map((item) => ({
      id: item.id ?? null,
      summary: item.summary ?? null,
      primary: item.primary ?? false,
      accessRole: item.accessRole ?? null,
      selected: item.selected ?? false,
    }));

    return NextResponse.json({
      ok: true,
      count: calendars.length,
      calendars,
    });
  } catch (error) {
    console.error("[google-calendar/test] error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Googleカレンダー一覧の取得に失敗しました",
      },
      { status: 500 },
    );
  }
}