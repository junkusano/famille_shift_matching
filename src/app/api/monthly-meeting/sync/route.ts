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
    // ym: "YYYY-MM"
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) throw new Error(`invalid ym: ${ym}`);
    const y = Number(m[1]);
    const mm = Number(m[2]);
    const monthStart = new Date(Date.UTC(y, mm - 1, 1));
    const nextMonth = new Date(Date.UTC(y, mm, 1));
    const monthStartStr = `${y}-${pad2(mm)}-01`; // date文字列
    return { monthStart, nextMonth, monthStartStr };
}

type UserRoleRow = {
    user_id: string | null;
    system_role: string | null;
};

async function requireFullRole(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) throw new Error("unauthorized");

    const { data, error } = await supabaseAdmin
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle<UserRoleRow>();

    if (error) throw error;

    const myUserId = data?.user_id ?? "";
    const role = data?.system_role ?? "";

    // プロジェクトのロール命名に合わせて調整してください
    // 例: "FULL" / "MANAGER" / "STAFF"
    if (role !== "FULL") throw new Error("forbidden: FULL only");

    return { myUserId, role };
}

type ShiftStaffRow = {
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
};

export async function POST(req: NextRequest) {
    try {
        await requireFullRole(req);

        const body: unknown = await req.json().catch(() => ({}));
        const ym =
            typeof (body as { ym?: unknown })?.ym === "string" ? (body as { ym: string }).ym : "";

        if (!ym) return json({ ok: false, error: "ym is required (YYYY-MM)" }, 400);

        const { monthStart, nextMonth, monthStartStr } = parseYm(ym);

        const fromDate = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
        const toDate = nextMonth.toISOString().slice(0, 10); // YYYY-MM-DD

        // 1) shift から対象 staff を抽出（staff_01/02/03）
        const { data: shifts, error: sErr } = await supabaseAdmin
            .from("shift")
            .select("staff_01_user_id, staff_02_user_id, staff_03_user_id")
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .limit(100000)
            .returns<ShiftStaffRow[]>(); // ← ここで型を固定

        if (sErr) throw sErr;

        const set = new Set<string>();

        for (const r of shifts ?? []) {
            if (r.staff_01_user_id) set.add(r.staff_01_user_id);
            if (r.staff_02_user_id) set.add(r.staff_02_user_id);
            if (r.staff_03_user_id) set.add(r.staff_03_user_id);
        }

        const staffIds = Array.from(set);

        // 2) monthly_meeting_attendance へ upsert（required=true）
        const upserts = staffIds.map((user_id) => ({
            target_month: monthStartStr,
            user_id,
            required: true,
            updated_at: new Date().toISOString(),
        }));

        if (upserts.length > 0) {
            const { error: upErr } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .upsert(upserts, { onConflict: "target_month,user_id" });

            if (upErr) throw upErr;
        }

        return json({
            ok: true,
            ym,
            monthStart: monthStartStr,
            required_count: upserts.length,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}
