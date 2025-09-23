// src/app/portal/roster/daily/page.tsx
import { getDailyRosterView } from "@/lib/roster/rosterDailyRepo";
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";


const toJstYmd = (d: Date) =>
new Intl.DateTimeFormat("sv-SE", {
timeZone: "Asia/Tokyo",
year: "numeric",
month: "2-digit",
day: "2-digit",
}).format(d);


export default async function Page({ searchParams }: { searchParams?: Record<string, string> }) {
const date = (searchParams?.date as string) ?? toJstYmd(new Date());
const initialView = await getDailyRosterView(date);
return <RosterBoardDaily date={date} initialView={initialView} deletable />;
}