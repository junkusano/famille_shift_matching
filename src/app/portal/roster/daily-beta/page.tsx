// シフト表（β版）: 既存のシフト表とは独立した表示確認用ページ
import { getDailyRosterView } from "@/lib/roster/rosterDailyRepo";
import RosterBoardDaily from "@/components/roster/RosterBoardDaily";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/service";

const toJstYmd = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

export default async function Page({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const auth = createServerComponentClient({ cookies });
  const { data: authData } = await auth.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: staff } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (!["admin", "manager"].includes((staff?.system_role ?? "").toLowerCase())) {
    redirect("/portal");
  }

  const date = searchParams?.date ?? toJstYmd(new Date());
  const initialView = await getDailyRosterView(date, { hideInactiveStaff: true });

  return (
    <RosterBoardDaily
      date={date}
      initialView={initialView}
      basePath="/portal/roster/daily-beta"
      beta
      deletable
    />
  );
}
