// src/app/portal/roster/daily/page.tsx
import "server-only";
import { getDailyShiftView } from "@/lib/roster/rosterDailyRepo"; // or getRosterDailyView
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";
import type { RosterDailyView } from "@/types/roster";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function todayJstYYYYMMDD(): string {
  // "YYYY-MM-DD" を JST で生成
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { date?: string };
}) {
  const date = searchParams?.date ?? todayJstYYYYMMDD();

  let view: RosterDailyView = { date, staff: [], shifts: [] };
  try {
    view = await getDailyShiftView(date);
  } catch (e) {
    console.error("[roster/daily] getDailyShiftView failed:", e);
  }

  return <RosterBoardDaily date={date} initialView={view} />;
}
