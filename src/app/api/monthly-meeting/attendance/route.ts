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

    const monthStartStr = `${y}-${pad2(mm)}-01`; // YYYY-MM-01
    const fromDate = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
    const toDate = nextMonth.toISOString().slice(0, 10); // YYYY-MM-DD

    return { monthStartStr, fromDate, toDate };
}

type UserRoleRow = { user_id: string | null; system_role: string | null };

async function readMyRole(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) throw new Error("unauthorized");

    const { data: u, error } = await supabaseAdmin
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle<UserRoleRow>();

    if (error) throw error;
    return { myUserId: String(u?.user_id ?? ""), role: String(u?.system_role ?? "") };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

/** shift から見るのは staff_01 / staff_02 のみ */
type ShiftStaffRow = {
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
};

type AttendanceRow = {
    target_month: string;
    user_id: string;
    required: boolean;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    minutes_url: string | null;
    staff_comment: string | null;
    manager_checked: boolean | null;
};

type StaffRow = {
    user_id: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    orgunitname: string | null;
    roster_sort: string | null;
};

export async function GET(req: NextRequest) {
    try {
        await readMyRole(req);

        const ym = req.nextUrl.searchParams.get("ym") ?? "";
        if (!ym) return json({ ok: false, error: "ym is required (YYYY-MM)" }, 400);

        const { monthStartStr, fromDate, toDate } = parseYm(ym);

        // 1) shiftから対象月の staff_01 / staff_02 を抽出
        const { data: shifts, error: sErr } = await supabaseAdmin
            .from("shift")
            .select("staff_01_user_id, staff_02_user_id")
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .limit(100000)
            .returns<ShiftStaffRow[]>();

        if (sErr) throw sErr;

        const staffSet = new Set<string>();
        for (const r of shifts ?? []) {
            if (r.staff_01_user_id) staffSet.add(r.staff_01_user_id);
            if (r.staff_02_user_id) staffSet.add(r.staff_02_user_id);
        }
        const staffIds = Array.from(staffSet);

        // 0件なら空で返す
        if (staffIds.length === 0) {
            return json({ ok: true, ym, rows: [] });
        }

        // 2) 名前を取得（姓+名）
        const { data: staffData, error: staffErr } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select("user_id,last_name_kanji,first_name_kanji,orgunitname,roster_sort")
            .in("user_id", staffIds)
            .order("roster_sort", { ascending: true })      // ★これが本命（最優先）
            .order("user_id", { ascending: true })          // ★同順位の安定化
            .returns<StaffRow[]>();
        if (staffErr) throw staffErr;

        // 3) attendance を取得（その月の既存値）
        const { data: att, error: attErr } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select("target_month,user_id,required,attended_regular,attended_extra,minutes_url,staff_comment,manager_checked")
            .eq("target_month", monthStartStr)
            .in("user_id", staffIds)
            .returns<AttendanceRow[]>();

        if (attErr) throw attErr;

        const attMap = new Map((att ?? []).map((r) => [r.user_id, r]));

        // 4) attendance に無い人は required=true で作成（表示できるように）
        const toInsert = staffIds
            .filter((uid) => !attMap.has(uid))
            .map((uid) => ({
                target_month: monthStartStr,
                user_id: uid,
                required: true,
            }));

        if (toInsert.length > 0) {
            const { error: insErr } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .insert(toInsert);
            if (insErr) throw insErr;

            // 作成後に取り直し
            const { data: att2, error: att2Err } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .select("target_month,user_id,required,attended_regular,attended_extra,minutes_url,staff_comment,manager_checked")
                .eq("target_month", monthStartStr)
                .in("user_id", staffIds)
                .returns<AttendanceRow[]>();
            if (att2Err) throw att2Err;

            attMap.clear();
            (att2 ?? []).forEach((r) => attMap.set(r.user_id, r));
        }

        // 5) rows を作って返す（名前は姓+名）
        const rows = (staffData ?? [])
            .map((s: StaffRow) => {
                const userId = String(s.user_id ?? "").trim();
                if (!userId) return null;

                const name = `${s.last_name_kanji ?? ""}${s.first_name_kanji ?? ""}`.trim() || userId;
                const r = attMap.get(userId);

                return {
                    target_month: monthStartStr,
                    user_id: userId,
                    full_name_kanji: name,
                    orgunitname: s.orgunitname ?? null,

                    required: r?.required ?? true,
                    attended_regular: r?.attended_regular ?? null,
                    attended_extra: r?.attended_extra ?? null,
                    minutes_url: r?.minutes_url ?? null,
                    staff_comment: r?.staff_comment ?? null,
                    manager_checked: r?.manager_checked ?? null,
                };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null);

        return json({ ok: true, ym, rows });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { myUserId, role } = await readMyRole(req);

        const body: unknown = await req.json();
        if (!isRecord(body)) return json({ ok: false, error: "invalid body" }, 400);

        const target_month = typeof body.target_month === "string" ? body.target_month : "";
        const user_id = typeof body.user_id === "string" ? body.user_id : "";
        if (!target_month || !user_id) {
            return json({ ok: false, error: "target_month and user_id required" }, 400);
        }

        const patch: Record<string, unknown> = {};
        const nowIso = new Date().toISOString();

        // 本人コメント：本人のみ
        if ("staff_comment" in body) {
            if (myUserId !== user_id) throw new Error("forbidden: only self can update staff_comment");
            patch.staff_comment = body.staff_comment == null ? null : String(body.staff_comment);
        }

        // 参加チェック＆議事録URL：FULLのみ（必要ならここを緩めてOK）
        const hasAttend = ("attended_regular" in body) || ("attended_extra" in body) || ("minutes_url" in body);
        if (hasAttend) {
            if (role !== "FULL") throw new Error("forbidden: FULL only can update attendance fields");

            if ("attended_regular" in body) patch.attended_regular = body.attended_regular == null ? null : Boolean(body.attended_regular);
            if ("attended_extra" in body) patch.attended_extra = body.attended_extra == null ? null : Boolean(body.attended_extra);
            if ("minutes_url" in body) patch.minutes_url = body.minutes_url == null ? null : String(body.minutes_url);
        }

        // 確認：MANAGERのみ
        if ("manager_checked" in body) {
            if (role !== "MANAGER") throw new Error("forbidden: MANAGER only can update manager_checked");
            patch.manager_checked = body.manager_checked == null ? null : Boolean(body.manager_checked);
        }

        if (!Object.keys(patch).length) {
            return json({ ok: false, error: "no updatable fields in body" }, 400);
        }

        patch.updated_at = nowIso;

        const { error } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .update(patch)
            .eq("target_month", target_month)
            .eq("user_id", user_id);

        if (error) throw error;

        return json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}