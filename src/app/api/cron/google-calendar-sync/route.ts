import { google, calendar_v3 } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type CalendarLink = {
  user_id: string;
  google_calendar_id: string;
  calendar_name: string | null;
};

type GoogleEventRow = {
  google_calendar_id: string;
  google_event_id: string;
  user_id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  google_status: string | null;
  google_updated_at: string | null;
  google_etag: string | null;
  is_deleted: boolean;
  editable_in_myfamille: boolean;
  synced_at: string;
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

function getGoogleCalendarApi() {
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

  return google.calendar({
    version: "v3",
    auth: oauth2Client,
  });
}

/**
 * Vercel Cronまたは手動実行用の認証です。
 *
 * 優先順位:
 * 1. Authorization: Bearer CRON_SECRET
 * 2. x-cron-secret: CRON_SECRET
 * 3. ?secret=CRON_SECRET
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      "[google-calendar-sync] CRON_SECRET is missing",
    );
    return false;
  }

  const authorization =
    request.headers.get("authorization");

  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  const headerSecret =
    request.headers.get("x-cron-secret")?.trim();

  const querySecret =
    request.nextUrl.searchParams.get("secret")?.trim();

  return (
    bearerToken === cronSecret ||
    headerSecret === cronSecret ||
    querySecret === cronSecret
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Googleの終日予定は、次の形式です。
 *
 * start.date = "2026-07-14"
 * end.date   = "2026-07-15"
 *
 * 日本時間の0時として保存します。
 */
function googleDateToIso(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

function getEventDateTime(
  eventDateTime: calendar_v3.Schema$EventDateTime | undefined,
): {
  iso: string | null;
  isAllDay: boolean;
} {
  if (!eventDateTime) {
    return {
      iso: null,
      isAllDay: false,
    };
  }

  if (eventDateTime.dateTime) {
    return {
      iso: new Date(eventDateTime.dateTime).toISOString(),
      isAllDay: false,
    };
  }

  if (eventDateTime.date) {
    return {
      iso: googleDateToIso(eventDateTime.date),
      isAllDay: true,
    };
  }

  return {
    iso: null,
    isAllDay: false,
  };
}

/**
 * 対象カレンダーから、指定期間の予定を全ページ取得します。
 */
async function getAllEvents(
  calendarApi: calendar_v3.Calendar,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<calendar_v3.Schema$Event[]> {
  const events: calendar_v3.Schema$Event[] = [];

  let pageToken: string | undefined;

  do {
    const response = await calendarApi.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: true,
      orderBy: "startTime",
      maxResults: 2500,
      pageToken,
      timeZone: "Asia/Tokyo",
    });

    events.push(...(response.data.items ?? []));

    pageToken =
      response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return events;
}

function convertGoogleEventToRow(
  event: calendar_v3.Schema$Event,
  link: CalendarLink,
  syncedAt: string,
): GoogleEventRow | null {
  if (!event.id) {
    return null;
  }

  /*
   * 削除済みイベントはstart/endが返らない場合があります。
   * この場合は後段の差分削除処理でis_deletedを更新します。
   */
  if (event.status === "cancelled") {
    return null;
  }

  const start = getEventDateTime(event.start);
  const end = getEventDateTime(event.end);

  if (!start.iso || !end.iso) {
    console.warn(
      "[google-calendar-sync] event has no start/end",
      {
        calendarId: link.google_calendar_id,
        eventId: event.id,
        status: event.status,
      },
    );

    return null;
  }

  return {
    google_calendar_id:
      link.google_calendar_id,
    google_event_id: event.id,
    user_id: link.user_id,
    title: event.summary ?? null,
    description: event.description ?? null,
    location: event.location ?? null,
    start_at: start.iso,
    end_at: end.iso,
    is_all_day:
      start.isAllDay || end.isAllDay,
    google_status: event.status ?? null,
    google_updated_at: event.updated
      ? new Date(event.updated).toISOString()
      : null,
    google_etag: event.etag ?? null,
    is_deleted: false,
    editable_in_myfamille: false,
    synced_at: syncedAt,
  };
}

async function syncGoogleCalendars() {
  const startedAt = new Date();
  const syncedAt = startedAt.toISOString();

  const timeMin = addDays(startedAt, -30).toISOString();
  const timeMax = addDays(startedAt, 90).toISOString();

  const supabase = getSupabaseAdmin();
  const calendarApi = getGoogleCalendarApi();

  const { data: links, error: linksError } =
    await supabase
      .from("google_calendar_user_links")
      .select(
        [
          "user_id",
          "google_calendar_id",
          "calendar_name",
        ].join(","),
      )
      .eq("sync_enabled", true)
      .order("user_id");

  if (linksError) {
    throw new Error(
      `カレンダー紐付けの取得に失敗しました: ${linksError.message}`,
    );
  }

  const calendarLinks =
    (links ?? []) as CalendarLink[];

  let fetchedEventCount = 0;
  let upsertedEventCount = 0;
  let deletedEventCount = 0;
  let successCalendarCount = 0;

  const errors: Array<{
    user_id: string;
    google_calendar_id: string;
    message: string;
  }> = [];

  for (const link of calendarLinks) {
    try {
      console.log(
        "[google-calendar-sync] calendar start",
        {
          userId: link.user_id,
          calendarId: link.google_calendar_id,
        },
      );

      const googleEvents = await getAllEvents(
        calendarApi,
        link.google_calendar_id,
        timeMin,
        timeMax,
      );

      fetchedEventCount += googleEvents.length;

      const activeRows = googleEvents
        .map((event) =>
          convertGoogleEventToRow(
            event,
            link,
            syncedAt,
          ),
        )
        .filter(
          (row): row is GoogleEventRow =>
            row !== null,
        );

      /*
       * Google上で現在存在するイベントIDです。
       */
      const activeGoogleEventIds = new Set(
        activeRows.map(
          (row) => row.google_event_id,
        ),
      );

      /*
       * 追加・更新を行います。
       */
      if (activeRows.length > 0) {
        const { error: upsertError } =
          await supabase
            .from("google_calendar_events")
            .upsert(activeRows, {
              onConflict:
                "google_calendar_id,google_event_id",
            });

        if (upsertError) {
          throw new Error(
            `予定のupsertに失敗しました: ${upsertError.message}`,
          );
        }

        upsertedEventCount += activeRows.length;
      }

      /*
       * DBに保存済みの、今回の取得期間と重なる予定を取得します。
       */
      const {
        data: existingEvents,
        error: existingError,
      } = await supabase
        .from("google_calendar_events")
        .select("id,google_event_id")
        .eq(
          "google_calendar_id",
          link.google_calendar_id,
        )
        .eq("is_deleted", false)
        .lt("start_at", timeMax)
        .gt("end_at", timeMin);

      if (existingError) {
        throw new Error(
          `既存予定の取得に失敗しました: ${existingError.message}`,
        );
      }

      /*
       * DBには存在するがGoogleの取得結果に存在しない予定は、
       * Google側で削除されたものとして論理削除します。
       */
      const deletedIds = (existingEvents ?? [])
        .filter(
          (event) =>
            !activeGoogleEventIds.has(
              String(event.google_event_id),
            ),
        )
        .map((event) => String(event.id));

      if (deletedIds.length > 0) {
        const { error: deleteUpdateError } =
          await supabase
            .from("google_calendar_events")
            .update({
              is_deleted: true,
              google_status: "cancelled",
              synced_at: syncedAt,
            })
            .in("id", deletedIds);

        if (deleteUpdateError) {
          throw new Error(
            `削除予定の反映に失敗しました: ${deleteUpdateError.message}`,
          );
        }

        deletedEventCount += deletedIds.length;
      }

      /*
       * カレンダー単位の最終同期日時を更新します。
       */
      const { error: linkUpdateError } =
        await supabase
          .from("google_calendar_user_links")
          .update({
            last_synced_at: syncedAt,
          })
          .eq(
            "google_calendar_id",
            link.google_calendar_id,
          );

      if (linkUpdateError) {
        throw new Error(
          `最終同期日時の更新に失敗しました: ${linkUpdateError.message}`,
        );
      }

      successCalendarCount++;

      console.log(
        "[google-calendar-sync] calendar completed",
        {
          userId: link.user_id,
          calendarId: link.google_calendar_id,
          fetched: googleEvents.length,
          active: activeRows.length,
          deleted: deletedIds.length,
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "不明なエラー";

      console.error(
        "[google-calendar-sync] calendar failed",
        {
          userId: link.user_id,
          calendarId: link.google_calendar_id,
          error: message,
        },
      );

      errors.push({
        user_id: link.user_id,
        google_calendar_id:
          link.google_calendar_id,
        message,
      });
    }
  }

  return {
    ok: errors.length === 0,
    target_calendar_count: calendarLinks.length,
    success_calendar_count: successCalendarCount,
    failed_calendar_count: errors.length,
    fetched_event_count: fetchedEventCount,
    upserted_event_count: upsertedEventCount,
    deleted_event_count: deletedEventCount,
    range: {
      time_min: timeMin,
      time_max: timeMax,
    },
    started_at: syncedAt,
    completed_at: new Date().toISOString(),
    errors,
  };
}

async function handleRequest(
  request: NextRequest,
) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  try {
    console.log(
      "[google-calendar-sync] start",
    );

    const result =
      await syncGoogleCalendars();

    console.log(
      "[google-calendar-sync] completed",
      result,
    );

    return NextResponse.json(result, {
      status: result.ok ? 200 : 207,
    });
  } catch (error) {
    console.error(
      "[google-calendar-sync] fatal error",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Googleカレンダー同期に失敗しました",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(
  request: NextRequest,
) {
  return handleRequest(request);
}

export async function POST(
  request: NextRequest,
) {
  return handleRequest(request);
}