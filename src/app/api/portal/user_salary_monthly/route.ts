//api/portal/user_salary_monthly/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

function getMonthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!userRow?.user_id) {
      return NextResponse.json({ error: "user not found" }, { status: 404 });
    }

    const ym = req.nextUrl.searchParams.get("ym");
    const payDate = req.nextUrl.searchParams.get("payDate");

    let query = supabaseAdmin
      .from("user_salary_monthly")
      .select("*")
      .eq("従業員番号", userRow.user_id)
      .order("支給日", { ascending: false });

    if (payDate) {
      query = query.eq("支給日", payDate);
    } else if (ym) {
      const { start, end } = getMonthRange(ym);
      query = query.gte("支給日", start).lt("支給日", end);
    }

    const { data, error } = await query;

    if (error) throw error;

    const { data: months, error: monthsError } = await supabaseAdmin
      .from("user_salary_monthly")
      .select("支給日")
      .eq("従業員番号", userRow.user_id)
      .order("支給日", { ascending: false });

    if (monthsError) throw monthsError;

    const availablePayDates = (months ?? []).map((r) => String(r["支給日"]));

    const availableMonths = Array.from(
      new Set(availablePayDates.map((d) => d.slice(0, 7)))
    );

    return NextResponse.json({
      ok: true,
      user_id: userRow.user_id,
      rows: data ?? [],
      availableMonths,
      availablePayDates,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}