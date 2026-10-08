import { createClient } from "@supabase/supabase-js";
import { getDailyRosterView } from "@/lib/roster/rosterDailyRepo";
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";

const toJstYmd = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

type GoogleCalendarEvent = {
  id: string;
  user_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
};

type Props = {
  searchParams?: Record<string, string>;
  beta?: boolean;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません");
  }

  if (!serviceRoleKey) {
    throw new Error("環境変数 SUPABASE_SERVICE_ROLE_KEY が設定されていません");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getGoogleCalendarEvents(date: string) {
  const dayStart = new Date(`${date}T00:00:00+09:00`);
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);

  const { data, error } = await getSupabaseAdmin()
    .from("google_calendar_events")
    .select("id,user_id,title,start_at,end_at,is_all_day")
    .eq("is_deleted", false)
    .lt("start_at", nextDayStart.toISOString())
    .gt("end_at", dayStart.toISOString())
    .order("start_at");

  if (error) {
    console.error("[roster/daily] Google予定取得エラー", error);
  }

  return (data ?? []).map((row) => {
    const item = row as unknown as GoogleCalendarEvent;

    return {
      id: String(item.id),
      user_id: String(item.user_id),
      title: item.title ?? null,
      start_at: String(item.start_at),
      end_at: String(item.end_at),
      is_all_day: Boolean(item.is_all_day),
    } satisfies GoogleCalendarEvent;
  });
}

export default async function DailyRosterPage({
  searchParams,
  beta = false,
}: Props) {
  const date = searchParams?.date ?? toJstYmd(new Date());
  const [initialView, googleCalendarEvents] = await Promise.all([
    getDailyRosterView(date),
    getGoogleCalendarEvents(date),
  ]);

  return (
    <RosterBoardDaily
      key={`${beta ? "beta" : "current"}-${date}`}
      date={date}
      initialView={initialView}
      googleCalendarEvents={googleCalendarEvents}
      basePath={beta ? "/portal/roster/daily-beta" : "/portal/roster/daily"}
      beta={beta}
      deletable
    />
  );
}
