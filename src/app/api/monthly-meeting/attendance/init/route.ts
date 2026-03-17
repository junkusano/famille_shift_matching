import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function parseYm(ym: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) throw new Error(`invalid ym: ${ym}`);

    const y = Number(m[1]);
    const mm = Number(m[2]);

    const monthStart = new Date(Date.UTC(y, mm - 1, 1));
    const nextMonth = new Date(Date.UTC(y, mm, 1));

    return {
        monthStartStr: `${y}-${pad2(mm)}-01`,
        fromDate: monthStart.toISOString().slice(0, 10),
        toDate: nextMonth.toISOString().slice(0, 10),
    };
}

type UserRoleRow = {
    user_id: string | null;
    system_role: string | null;
};

async function readMyRole(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) throw new Error("unauthorized");

    const { data, error } = await supabaseAdmin
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle<UserRoleRow>();

    if (error) throw error;

    return {
        myUserId: String(data?.user_id ?? ""),
        role: String(data?.system_role ?? "").trim().toUpperCase(),
    };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

type ShiftStaffRow = {
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
};

export async function POST(req: NextRequest) {
    try {
        // 認証確認
        await readMyRole(req);

        const body: unknown = await req.json();
        if (!isRecord(body)) {
            return json({ ok: false, error: "invalid body" }, 400);
        }

        const ym = typeof body["ym"] === "string" ? body["ym"] : "";
        if (!ym) {
            return json({ ok: false, error: "ym is required (YYYY-MM)" }, 400);
        }

        const { monthStartStr, fromDate, toDate } = parseYm(ym);

        // 1) 対象月の shift から staff を集める
        const { data: shifts, error: shiftErr } = await supabaseAdmin
            .from("shift")
            .select("staff_01_user_id, staff_02_user_id")
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .limit(100000)
            .returns<ShiftStaffRow[]>();

        if (shiftErr) throw shiftErr;

        const staffSet = new Set<string>();
        for (const row of shifts ?? []) {
            if (row.staff_01_user_id) staffSet.add(row.staff_01_user_id);
            if (row.staff_02_user_id) staffSet.add(row.staff_02_user_id);
        }

        const staffIds = Array.from(staffSet);

        // shiftに誰もいない月は何もしない
        if (staffIds.length === 0) {
            return json({
                ok: true,
                ym,
                initialized: 0,
                skipped: true,
            });
        }

        // 2) すでにある attendance を確認
        const { data: existing, error: existingErr } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select("user_id")
            .eq("target_month", monthStartStr)
            .in("user_id", staffIds);

        if (existingErr) throw existingErr;

        const existingSet = new Set(
            (existing ?? [])
                .map((r) => String(r.user_id ?? "").trim())
                .filter((v) => v.length > 0)
        );

        // 3) 無い人だけ作る
        const toInsert = staffIds
            .filter((uid) => !existingSet.has(uid))
            .map((uid) => ({
                target_month: monthStartStr,
                user_id: uid,
                required: true,
            }));

        if (toInsert.length > 0) {
            const { error: upsertErr } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .upsert(toInsert, {
                    onConflict: "target_month,user_id",
                    ignoreDuplicates: true,
                });

            if (upsertErr) throw upsertErr;
        }

        return json({
            ok: true,
            ym,
            initialized: toInsert.length,
            total_staff: staffIds.length,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}