//api/parking/cs_places/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

type Row = {
    id: string;
    kaipoke_cs_id: string;
    serial: number;
    label: string;
    location_link: string | null;
    parking_orientation: string | null;
    permit_required: boolean | null;
    remarks: string | null;
    police_station_place_id: string | null;
    created_at: string | null;
    updated_at: string | null;

    client_name: string | null;
    client_address: string | null;

    next_shift_date: string | null;
    first_shift_date: string | null;
    is_active: boolean;
};

function addMonths(date: Date, months: number) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

export async function GET(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user?.id) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabaseAdmin
        .from("parking_cs_places_admin_view")
        .select("*")
        .order("updated_at", { ascending: false })
        .order("kaipoke_cs_id", { ascending: true })
        .order("serial", { ascending: true });

    if (q) {
        query = query.or(
            [
                `police_station_place_id.ilike.%${q}%`,
                `label.ilike.%${q}%`,
                `remarks.ilike.%${q}%`,
                `client_name.ilike.%${q}%`,
                `client_address.ilike.%${q}%`,
            ].join(",")
        );
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
    const todayJst = new Date(todayStr);
    const limitFuture = addMonths(todayJst, 2);
    const limitPast = addMonths(todayJst, -2);


    const rows = ((data ?? []) as Row[]).map((r) => {
        const nextShift = r.next_shift_date ? new Date(r.next_shift_date) : null;
        const firstShift = r.first_shift_date ? new Date(r.first_shift_date) : null;

        const hasUpcomingShiftWithin2Months = !!(nextShift && nextShift <= limitFuture);
        const firstShiftWithin2Months = !!(firstShift && firstShift >= limitPast);

        return {
            ...r,
            hasUpcomingShiftWithin2Months,
            firstShiftWithin2Months,
            isTarget: hasUpcomingShiftWithin2Months || firstShiftWithin2Months,
        };
    });

    return NextResponse.json({ ok: true, rows });
}
