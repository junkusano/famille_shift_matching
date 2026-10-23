import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShiftRow = {
  shift_start_date: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

type CalendarEventRow = {
  id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase env is missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: Request) {
  const shiftId = new URL(req.url).searchParams.get("shift_id")?.trim();

  if (!shiftId) {
    return NextResponse.json({ error: "shift_id required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser(token);

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: actor } = await supabase
      .from("users")
      .select("user_id,system_role")
      .eq("auth_user_id", authUser.id)
      .maybeSingle<{ user_id: string; system_role: string | null }>();

    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: shift, error: shiftError } = await supabase
      .from("shift")
      .select(
        "shift_start_date,staff_01_user_id,staff_02_user_id,staff_03_user_id",
      )
      .eq("shift_id", shiftId)
      .maybeSingle<ShiftRow>();

    if (shiftError) {
      return NextResponse.json({ error: shiftError.message }, { status: 500 });
    }

    if (!shift) {
      return NextResponse.json({ error: "shift not found" }, { status: 404 });
    }

    const staffIds = [
      shift.staff_01_user_id,
      shift.staff_02_user_id,
      shift.staff_03_user_id,
    ].filter((id): id is string => Boolean(id?.trim()));

    const elevated = ["admin", "manager"].includes(
      (actor.system_role ?? "").toLowerCase(),
    );

    if (!elevated && !staffIds.includes(actor.user_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!shift.shift_start_date || staffIds.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const dayStart = new Date(`${shift.shift_start_date}T00:00:00+09:00`);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setUTCDate(nextDayStart.getUTCDate() + 1);

    const { data, error } = await supabase
      .from("google_calendar_events")
      .select("id,title,start_at,end_at,is_all_day")
      .eq("is_deleted", false)
      .in("user_id", Array.from(new Set(staffIds)))
      .lt("start_at", nextDayStart.toISOString())
      .gt("end_at", dayStart.toISOString())
      .order("start_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = ((data ?? []) as CalendarEventRow[]).filter((event) => {
      const eventDate = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(event.start_at));

      return (
        eventDate === shift.shift_start_date &&
        (event.title ?? "").trim().startsWith("【契約】")
      );
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[google-calendar/linked-events] failed", error);
    return NextResponse.json(
      { error: "Google予定の取得に失敗しました" },
      { status: 500 },
    );
  }
}
