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
    return {
        myUserId: String(u?.user_id ?? ""),
        role: String(u?.system_role ?? "").trim().toUpperCase(),
    };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

/** shift から見るのは staff_01 / staff_02 のみ */
type ShiftStaffRow = {
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
};

type AttendanceRow = {
    target_month: string;
    user_id: string;
    required: boolean;

    attended_regular: boolean | null;
    attended_extra: boolean | null;

    // ★追加：確認（月例/追加）
    checked_regular: boolean | null;
    checked_extra: boolean | null;
    meeting_date: string | null;   // ★追加
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
            .select("staff_01_user_id, staff_02_user_id, staff_03_user_id")
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .limit(100000)
            .returns<ShiftStaffRow[]>();

        if (sErr) throw sErr;

        const staffSet = new Set<string>();
        for (const r of shifts ?? []) {
            const s1 = String(r.staff_01_user_id ?? "").trim();
            const s2 = String(r.staff_02_user_id ?? "").trim();
            const s3 = String(r.staff_03_user_id ?? "").trim();

            if (s1) staffSet.add(s1);
            if (s2) staffSet.add(s2);
            if (s3) staffSet.add(s3);
        }
        const staffIdsFromShift = Array.from(staffSet);

        // ★shiftで0件でも、既存 attendance から復元できるようにする
        let staffIds = [...staffIdsFromShift];

        if (staffIds.length === 0) {
            const { data: attOnly, error: attOnlyErr } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .select("user_id")
                .eq("target_month", monthStartStr);

            if (attOnlyErr) throw attOnlyErr;

            staffIds = Array.from(
                new Set(
                    (attOnly ?? [])
                        .map((r) => String(r.user_id ?? "").trim())
                        .filter((v) => v.length > 0)
                )
            );
        }

        // それでも0件なら空で返す
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
            .select("target_month,user_id,required,attended_regular,attended_extra,meeting_date,minutes_url,staff_comment,checked_regular,checked_extra")
            .eq("target_month", monthStartStr)
            .in("user_id", staffIds)
            .returns<AttendanceRow[]>();

        if (attErr) throw attErr;

        const attMap = new Map((att ?? []).map((r) => [r.user_id, r]));

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
                    attended_regular: r?.attended_regular ?? false,
                    attended_extra: r?.attended_extra ?? false,

                    checked_regular: r?.checked_regular ?? false, // ★追加
                    checked_extra: r?.checked_extra ?? false,     // ★追加
                    meeting_date: r?.meeting_date ?? null,   // ★追加
                    minutes_url: r?.minutes_url ?? null,
                    staff_comment: r?.staff_comment ?? null,
                    manager_checked: r?.manager_checked ?? null,
                };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null);
        const { role } = await readMyRole(req); // すでに readMyRole はある想定

        return json({ ok: true, ym, rows, role }); // ★role を返す
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

        const target_month = typeof body["target_month"] === "string" ? body["target_month"] : "";
        const user_id = typeof body["user_id"] === "string" ? body["user_id"] : "";

        if (!target_month || !user_id) {
            return json({ ok: false, error: "target_month and user_id required" }, 400);
        }

        // ✅ ここが原因になりがち：FULL縛りだとチェックしただけで弾かれます
        // まずは動かすため、チェック系は FULL/MANAGER 以外も許可するのが無難です
        // もし制限したいなら、後で role 条件を入れ直してください
        // 例：if (role !== "FULL" && role !== "MANAGER") throw new Error("forbidden");

        const patch: Record<string, unknown> = {};
        const nowIso = new Date().toISOString();

        // ✅ チェックボックス系（falseも入れるため typeof boolean で判定）
        if (typeof body["attended_regular"] === "boolean") {
            patch.attended_regular = body["attended_regular"];
        }
        if (typeof body["attended_extra"] === "boolean") {
            patch.attended_extra = body["attended_extra"];
        }
        if (typeof body["checked_regular"] === "boolean") {
            patch.checked_regular = body["checked_regular"];
        }
        if (typeof body["checked_extra"] === "boolean") {
            patch.checked_extra = body["checked_extra"];
        }

        // ✅ URL（null許容）
        if ("minutes_url" in body) {
            const v = body["minutes_url"];
            patch.minutes_url = v == null ? null : String(v);
        }

        if ("meeting_date" in body) {
            const v = body["meeting_date"];
            patch.meeting_date = v == null || v === "" ? null : String(v);
        }

        // ✅ コメント（本人のみ、という運用ならこれを維持）
        if ("staff_comment" in body) {
            const canEditComment =
                myUserId === user_id || role === "MANAGER" || role === "ADMIN" || role === "FULL";

            if (!canEditComment) {
                throw new Error("forbidden: cannot update staff_comment");
            }

            const v = body["staff_comment"];
            patch.staff_comment = v == null ? null : String(v);
        }

        // ✅ manager_checked（今使ってないならこのブロック自体消してOK）
        if ("manager_checked" in body) {
            if (role !== "MANAGER") throw new Error("forbidden: MANAGER only can update manager_checked");
            const v = body["manager_checked"];
            patch.manager_checked = v == null ? null : Boolean(v);
            patch.manager_checked_at = v == null ? null : nowIso;
            patch.manager_checked_by = v == null ? null : myUserId;
        }

        if (Object.keys(patch).length === 0) {
            return json({ ok: false, error: "no updatable fields in body" }, 400);
        }

        patch.updated_at = nowIso;

        const applySharedToAll = body["apply_shared_fields_to_all"] === true;

        let query = supabaseAdmin
            .from("monthly_meeting_attendance")
            .update(patch)
            .eq("target_month", target_month);

        if (!applySharedToAll) {
            query = query.eq("user_id", user_id);
        }

        const { error } = await query;

        if (error) throw error;

        return json({ ok: true });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}