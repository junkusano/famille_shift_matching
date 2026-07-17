// src/app/portal/roster/daily/page.tsx
import { createClient } from "@supabase/supabase-js";
import { getDailyRosterView } from "@/lib/roster/rosterDailyRepo";
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";

const toJstYmd = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

type GoogleCalendarEvent = {
  id: string;
  user_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません",
    );
  }

  if (!serviceRoleKey) {
    throw new Error(
      "環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const date =
    (searchParams?.date as string) ??
    toJstYmd(new Date());

  const initialView = await getDailyRosterView(date);

  /*
   * 選択日の日本時間0時から翌日0時まで。
   */
  const dayStart = new Date(
    `${date}T00:00:00+09:00`,
  );

  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);

  const supabase = getSupabaseAdmin();

  /*
   * 選択日に重なるGoogle予定を取得します。
   *
   * start_at < 翌日0時
   * end_at   > 当日0時
   */
  const {
    data: googleCalendarEventsData,
    error: googleCalendarEventsError,
  } = await supabase
    .from("google_calendar_events")
    .select(
      [
        "id",
        "user_id",
        "title",
        "start_at",
        "end_at",
        "is_all_day",
      ].join(","),
    )
    .eq("is_deleted", false)
    .lt("start_at", nextDayStart.toISOString())
    .gt("end_at", dayStart.toISOString())
    .order("start_at");

  if (googleCalendarEventsError) {
    console.error(
      "[roster/daily] Google予定取得エラー",
      googleCalendarEventsError,
    );
  }

  const googleCalendarEvents: GoogleCalendarEvent[] =
    (googleCalendarEventsData ?? []).map((row) => {
      const item = row as unknown as GoogleCalendarEvent;

      return {
        id: String(item.id),
        user_id: String(item.user_id),
        title: item.title ?? null,
        start_at: String(item.start_at),
        end_at: String(item.end_at),
        is_all_day: Boolean(item.is_all_day),
      };
    });

  return (
    <RosterBoardDaily
      date={date}
      initialView={initialView}
      googleCalendarEvents={googleCalendarEvents}
      deletable
    />
  );
}