import DailyRosterPage from "@/components/roster/DailyRosterPage";

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  return <DailyRosterPage searchParams={searchParams} beta />;
}
