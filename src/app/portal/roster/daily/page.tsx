// ----------------------------------------------
// app/portal/roster/daily/page.tsx
// ----------------------------------------------
import { format } from "date-fns";
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";
import { getRosterDailyView } from "@/lib/roster/rosterDailyRepo";

export const dynamic = "force-dynamic"; // 当日切替などのためSSR

export default async function RosterDailyPage({ searchParams }: { searchParams?: { date?: string }}) {
  const date = searchParams?.date || format(new Date(), "yyyy-MM-dd");
  const view = await getRosterDailyView(date);
  return (
    <div className="p-4">
      <RosterBoardDaily date={date} initialView={view} />
    </div>
  );
}