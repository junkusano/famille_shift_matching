//api/parking/cs_places/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

type Row = {
    id: string;
    kaipoke_cs_id: string | null;
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
    is_pickup: boolean;
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
    const q = (searchParams.get("q") ?? "").trim().toLocaleLowerCase("ja");

    const { data: viewData, error } = await supabaseAdmin
        .from("parking_cs_places_admin_view")
        .select("*")
        .order("updated_at", { ascending: false })
        .order("kaipoke_cs_id", { ascending: true })
        .order("serial", { ascending: true });

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

    // admin_viewには追加直後の列が含まれない可能性があるため、基表を正として重ねる。
    // LEFT JOINで共通場所が欠落する既存viewにも対応する。
    const { data: baseData, error: baseError } = await supabaseAdmin
        .from("parking_cs_places")
        .select("id,kaipoke_cs_id,serial,label,location_link,parking_orientation,permit_required,remarks,police_station_place_id,created_at,updated_at,is_active,is_pickup")
        .order("updated_at", { ascending: false })
        .order("kaipoke_cs_id", { ascending: true })
        .order("serial", { ascending: true });

    if (baseError) return NextResponse.json({ ok: false, message: baseError.message }, { status: 400 });

    const viewById = new Map(
        ((viewData ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
    );

    const data = ((baseData ?? []) as Array<Record<string, unknown>>).map((base) => ({
        ...(viewById.get(String(base.id)) ?? {
            client_name: null,
            client_address: null,
            next_shift_date: null,
            first_shift_date: null,
        }),
        ...base,
    }));

    const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
    const todayJst = new Date(todayStr);
    const limitFuture = addMonths(todayJst, 2);
    const limitPast = addMonths(todayJst, -2);


    const rows = (data as Row[]).map((r) => {
        const nextShift = r.next_shift_date ? new Date(r.next_shift_date) : null;
        const firstShift = r.first_shift_date ? new Date(r.first_shift_date) : null;

        const hasUpcomingShiftWithin2Months = !!(nextShift && nextShift <= limitFuture);
        const firstShiftWithin2Months = !!(firstShift && firstShift >= limitPast);

        return {
            ...r,
            hasUpcomingShiftWithin2Months,
            firstShiftWithin2Months,
            isTarget: r.kaipoke_cs_id === null || hasUpcomingShiftWithin2Months || firstShiftWithin2Months,
        };
    }).filter((r) => {
        if (!q) return true;
        return [r.police_station_place_id, r.label, r.remarks, r.client_name, r.client_address]
            .some((value) => (value ?? "").toLocaleLowerCase("ja").includes(q));
    });

    return NextResponse.json({ ok: true, rows });
}

type CreateBody = {
    label?: string;
    location_link?: string | null;
    parking_orientation?: string | null;
    permit_required?: boolean;
    remarks?: string | null;
    police_station_place_id?: string | null;
    is_pickup?: boolean;
};

export async function POST(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user?.id) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

    const { data: urow, error: userError } = await supabaseAdmin
        .from("users")
        .select("system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle<{ system_role: string | null }>();
    if (userError) return NextResponse.json({ ok: false, message: userError.message }, { status: 400 });
    if ((urow?.system_role ?? "") === "member") {
        return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
    }

    let body: CreateBody;
    try {
        body = (await req.json()) as CreateBody;
    } catch {
        return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
    }

    const label = body.label?.trim();
    if (!label) return NextResponse.json({ ok: false, message: "場所名は必須です" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("parking_cs_places")
        .insert({
            kaipoke_cs_id: null,
            serial: 0,
            label,
            location_link: body.location_link?.trim() || null,
            parking_orientation: body.parking_orientation?.trim() || null,
            permit_required: body.permit_required ?? true,
            remarks: body.remarks?.trim() || null,
            police_station_place_id: body.police_station_place_id?.trim() || null,
            is_pickup: body.is_pickup ?? false,
            is_active: true,
        })
        .select("id")
        .single();

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, row: data });
}
