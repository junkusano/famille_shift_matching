import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CalendarMapping = {
  google_calendar_id: string;
  user_id: string;
};

type RegisterRequestBody = {
  dry_run?: boolean;
  mappings?: CalendarMapping[];
};

type GoogleCalendarItem = {
  google_calendar_id: string;
  calendar_name: string | null;
  access_role: string | null;
  primary: boolean;
  selected: boolean;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }

  return value;
}

function getSupabaseAdmin() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

/**
 * GoogleカレンダーIDがメールアドレス形式の場合、
 * @より前をマイファミーユ側のuser_id候補にします。
 *
 * 例:
 * masashisuzuki@shi-on.net
 * ↓
 * masashisuzuki
 */
function getUserIdCandidate(calendarId: string): string | null {
  if (!calendarId.includes("@")) {
    return null;
  }

  const localPart = calendarId.split("@")[0]?.trim();

  if (!localPart) {
    return null;
  }

  return localPart;
}

/**
 * APIを誰でも実行できないように、
 * setup_secretを確認します。
 *
 * GET:
 * ?setup_secret=xxxxx
 *
 * POST:
 * x-setup-secret: xxxxx
 */
function verifySetupSecret(request: NextRequest): boolean {
  const expectedSecret =
    process.env.GOOGLE_CALENDAR_OAUTH_SETUP_SECRET?.trim();

  const querySecret =
    request.nextUrl.searchParams.get("setup_secret")?.trim();

  const headerSecret =
    request.headers.get("x-setup-secret")?.trim();

  console.log("[google-calendar/register-calendars][secret-check]", {
    expectedSecretExists: Boolean(expectedSecret),
    expectedSecretLength: expectedSecret?.length ?? 0,
    querySecretExists: Boolean(querySecret),
    querySecretLength: querySecret?.length ?? 0,
    headerSecretExists: Boolean(headerSecret),
    queryMatches: Boolean(
      expectedSecret &&
        querySecret &&
        querySecret === expectedSecret,
    ),
  });

  if (!expectedSecret) {
    return false;
  }

  return (
    querySecret === expectedSecret ||
    headerSecret === expectedSecret
  );
}

/**
 * 代表アカウントから見えるGoogleカレンダーを
 * ページング込みですべて取得します。
 */
async function getAllGoogleCalendars(): Promise<
  GoogleCalendarItem[]
> {
  const oauth2Client = new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
    getRequiredEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
  );

  oauth2Client.setCredentials({
    refresh_token: getRequiredEnv(
      "GOOGLE_CALENDAR_REFRESH_TOKEN",
    ),
  });

  const calendarApi = google.calendar({
    version: "v3",
    auth: oauth2Client,
  });

  const calendars: GoogleCalendarItem[] = [];

  let pageToken: string | undefined;

  do {
    const response = await calendarApi.calendarList.list({
      minAccessRole: "reader",
      maxResults: 250,
      pageToken,
    });

    for (const item of response.data.items ?? []) {
      if (!item.id) {
        continue;
      }

      calendars.push({
        google_calendar_id: item.id,
        calendar_name:
          item.summaryOverride ??
          item.summary ??
          null,
        access_role: item.accessRole ?? null,
        primary: item.primary ?? false,
        selected: item.selected ?? false,
      });
    }

    pageToken =
      response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return calendars;
}

async function processRegistration(
  request: NextRequest,
  body: RegisterRequestBody,
) {
  if (!verifySetupSecret(request)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "setup_secretが正しくないか、GOOGLE_CALENDAR_OAUTH_SETUP_SECRETが設定されていません",
      },
      { status: 401 },
    );
  }

  const dryRun = body.dry_run ?? true;
  const explicitMappings = body.mappings ?? [];

  const supabase = getSupabaseAdmin();
  const calendars = await getAllGoogleCalendars();

  /**
   * マイファミーユ側に存在するuser_id一覧を取得します。
   */
  const { data: users, error: usersError } =
    await supabase
      .from("user_entry_united_view_single")
      .select("user_id")
      .not("user_id", "is", null);

  if (usersError) {
    throw new Error(
      `ユーザー一覧の取得に失敗しました: ${usersError.message}`,
    );
  }

  const validUserIds = new Set(
    (users ?? [])
      .map((user) =>
        String(user.user_id ?? "").trim(),
      )
      .filter(Boolean),
  );

  /**
   * 明示的に指定された対応表。
   *
   * key:
   * GoogleカレンダーID
   *
   * value:
   * マイファミーユ側user_id
   */
  const explicitMappingMap = new Map(
    explicitMappings
      .filter(
        (mapping) =>
          mapping.google_calendar_id &&
          mapping.user_id,
      )
      .map((mapping) => [
        mapping.google_calendar_id.trim(),
        mapping.user_id.trim(),
      ]),
  );

  const registerRows: Array<{
    user_id: string;
    google_calendar_id: string;
    calendar_name: string | null;
    access_role: string | null;
    sync_enabled: boolean;
  }> = [];

  const unmatchedCalendars: Array<{
    google_calendar_id: string;
    calendar_name: string | null;
    access_role: string | null;
    primary: boolean;
    candidate_user_id: string | null;
    reason: string;
  }> = [];

  for (const calendar of calendars) {
    const explicitlyMappedUserId =
      explicitMappingMap.get(
        calendar.google_calendar_id,
      );

    const candidateUserId =
      explicitlyMappedUserId ??
      getUserIdCandidate(
        calendar.google_calendar_id,
      );

    if (!candidateUserId) {
      unmatchedCalendars.push({
        google_calendar_id:
          calendar.google_calendar_id,
        calendar_name:
          calendar.calendar_name,
        access_role:
          calendar.access_role,
        primary:
          calendar.primary,
        candidate_user_id: null,
        reason:
          "カレンダーIDからuser_idを判定できません",
      });

      continue;
    }

    if (!validUserIds.has(candidateUserId)) {
      unmatchedCalendars.push({
        google_calendar_id:
          calendar.google_calendar_id,
        calendar_name:
          calendar.calendar_name,
        access_role:
          calendar.access_role,
        primary:
          calendar.primary,
        candidate_user_id:
          candidateUserId,
        reason:
          "マイファミーユに一致するuser_idがありません",
      });

      continue;
    }

    registerRows.push({
      user_id: candidateUserId,
      google_calendar_id:
        calendar.google_calendar_id,
      calendar_name:
        calendar.calendar_name,
      access_role:
        calendar.access_role,
      sync_enabled: true,
    });
  }

  if (!dryRun && registerRows.length > 0) {
    const { error: upsertError } =
      await supabase
        .from("google_calendar_user_links")
        .upsert(registerRows, {
          onConflict: "google_calendar_id",
        });

    if (upsertError) {
      throw new Error(
        `カレンダー紐付けの登録に失敗しました: ${upsertError.message}`,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    calendar_count: calendars.length,
    matched_count: registerRows.length,
    unmatched_count:
      unmatchedCalendars.length,
    registered_count:
      dryRun ? 0 : registerRows.length,
    matched: registerRows,
    unmatched: unmatchedCalendars,
  });
}

/**
 * GET
 *
 * 確認専用です。
 * DBには登録しません。
 */
export async function GET(
  request: NextRequest,
) {
  try {
    return await processRegistration(
      request,
      {
        dry_run: true,
        mappings: [],
      },
    );
  } catch (error) {
    console.error(
      "[google-calendar/register-calendars][GET]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "カレンダー登録確認に失敗しました",
      },
      { status: 500 },
    );
  }
}

/**
 * POST
 *
 * 実際のDB登録に使用します。
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as RegisterRequestBody;

    return await processRegistration(
      request,
      body,
    );
  } catch (error) {
    console.error(
      "[google-calendar/register-calendars][POST]",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "カレンダー登録に失敗しました",
      },
      { status: 500 },
    );
  }
}