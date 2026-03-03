import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function ymToMonthStartStr(ym: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) throw new Error(`invalid ym: ${ym}`);
    return `${m[1]}-${m[2]}-01`;
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

/** ====== type guards ====== */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

/** ====== GET: DB row type ====== */
type AttendanceRowDb = {
    target_month: string;
    user_id: string;
    required: boolean;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    minutes_url: string | null;
    staff_comment: string | null;
    manager_checked: boolean | null;
    users: { user_id: string | null } | null;
};

type StaffDto = {
    user_id: string;
    user_name: string;
    orgunitname: string | null;
    status: string | null;
};

export async function GET(req: NextRequest) {
    try {
        await readMyRole(req);

        const ym = req.nextUrl.searchParams.get("ym") ?? "";
        if (!ym) return json({ ok: false, error: "ym is required" }, 400);

        const monthStart = ymToMonthStartStr(ym);

        const { data, error } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select(`
    target_month,
    user_id,
    required,
    attended_regular,
    attended_extra,
    minutes_url,
    staff_comment,
    manager_checked,
    users:users(user_id)
  `)
            .eq("target_month", monthStart)
            .order("user_id", { ascending: true })
            .returns<AttendanceRowDb[]>();

        if (error) throw error;

        // ★在籍従業員一覧を取得（最初に1回だけ）
        const { data: staffData, error: staffErr } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select(`
    user_id,
    last_name_kanji,
    first_name_kanji,
    orgunitname,
    status,
    resign_date_latest,
    end_at
  `)
            // 在籍者のみ
            .is("end_at", null)
            .is("resign_date_latest", null)
            .neq("status", "removed_from_lineworks_kaipoke")
            // disability-check と同じ並び順に寄せる（部署→姓→名→ID）
            .order("orgunitname", { ascending: true })
            .order("last_name_kanji", { ascending: true })
            .order("first_name_kanji", { ascending: true })
            .order("user_id", { ascending: true });

        if (staffErr) throw staffErr;

        // ① すでに attendance に存在する user_id
        const existingUserIds = new Set(
            (data ?? []).map((r) => r.user_id)
        );

        // ③ monthly_meeting_attendance に無い人だけ作る
        const toInsert = (staffData ?? [])
            .map((s) => (s.user_id ?? "").trim())
            .filter((uid) => uid && !existingUserIds.has(uid))
            .map((uid) => ({
                target_month: monthStart,
                user_id: uid,
                required: true,
            }));

        // ④ 1件でもあれば INSERT
        if (toInsert.length > 0) {
            const { error: insertErr } = await supabaseAdmin
                .from("monthly_meeting_attendance")
                .insert(toInsert);

            if (insertErr) throw insertErr;
        }

        const staff: StaffDto[] = (staffData ?? []).map((r) => {
            const userId = (r.user_id ?? "").trim();
            const name = `${r.last_name_kanji ?? ""}${r.first_name_kanji ?? ""}`.trim();

            return {
                user_id: userId,
                user_name: name || userId,
                orgunitname: r.orgunitname ?? null,
                status: r.status ?? null,
            };
        });

        // ===== 追加②：attendance を user_id で引けるようにする =====
        const attendanceMap = new Map(
            (data ?? []).map((r) => [r.user_id, r])
        );

        // ===== 変更③：シフトに入っている人を必ず表示する =====
        const rows = (staffData ?? [])
            .map((s) => {
                const userId = (s.user_id ?? "").trim();
                if (!userId) return null;

                const r = attendanceMap.get(userId);

                return {
                    target_month: monthStart,
                    user_id: userId,
                    required: r?.required ?? true,
                    attended_regular: r?.attended_regular ?? null,
                    attended_extra: r?.attended_extra ?? null,
                    minutes_url: r?.minutes_url ?? null,
                    staff_comment: r?.staff_comment ?? null,
                    manager_checked: r?.manager_checked ?? null,
                    user_name: `${s.last_name_kanji ?? ""}${s.first_name_kanji ?? ""}`.trim() || userId,
                    // フロント側で使いやすいように明示的に返す
                    full_name_kanji: `${s.last_name_kanji ?? ""}${s.first_name_kanji ?? ""}`.trim() || userId,
                };
            })
            .filter((v): v is NonNullable<typeof v> => v !== null);

        return json({ ok: true, ym, rows, staff });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}

async function updateAttendance(req: NextRequest) {
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

    // 参加チェック＆議事録URL：FULLのみ
    const hasAttend =
        ("attended_regular" in body) || ("attended_extra" in body) || ("minutes_url" in body);

    if (hasAttend) {
        if (role !== "FULL") throw new Error("forbidden: FULL only can update attendance fields");

        if ("attended_regular" in body) {
            patch.attended_regular = body.attended_regular == null ? null : Boolean(body.attended_regular);
        }
        if ("attended_extra" in body) {
            patch.attended_extra = body.attended_extra == null ? null : Boolean(body.attended_extra);
        }
        if ("minutes_url" in body) {
            patch.minutes_url = body.minutes_url == null ? null : String(body.minutes_url);
        }
    }

    // 確認：MANAGERのみ
    if ("manager_checked" in body) {
        if (role !== "MANAGER") throw new Error("forbidden: MANAGER only can update manager_checked");

        const v = body.manager_checked == null ? null : Boolean(body.manager_checked);
        patch.manager_checked = v;
        patch.manager_checked_at = v == null ? null : nowIso;
        patch.manager_checked_by = v == null ? null : myUserId;
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
}

export async function POST(req: NextRequest) {
    try {
        const { myUserId, role } = await readMyRole(req);

        const body: unknown = await req.json();
        if (!isRecord(body)) return json({ ok: false, error: "invalid body" }, 400);

        const target_month = typeof body.target_month === "string" ? body.target_month : "";
        const user_id = typeof body.user_id === "string" ? body.user_id : "";

        if (!target_month || !user_id) {
            return json({ ok: false, error: "target_month and user_id required" }, 400);
        }

        // 更新したい項目（来たものだけ更新）
        const patch: Record<string, unknown> = {};
        const nowIso = new Date().toISOString();

        // 本人コメント：本人のみ
        if ("staff_comment" in body) {
            if (myUserId !== user_id) throw new Error("forbidden: only self can update staff_comment");
            patch.staff_comment = body.staff_comment == null ? null : String(body.staff_comment);
        }

        // 参加チェック＆議事録URL：FULLのみ
        const hasAttend =
            ("attended_regular" in body) || ("attended_extra" in body) || ("minutes_url" in body);

        if (hasAttend) {
            if (role !== "FULL") throw new Error("forbidden: FULL only can update attendance fields");

            if ("attended_regular" in body) {
                patch.attended_regular = body.attended_regular == null ? null : Boolean(body.attended_regular);
            }
            if ("attended_extra" in body) {
                patch.attended_extra = body.attended_extra == null ? null : Boolean(body.attended_extra);
            }
            if ("minutes_url" in body) {
                patch.minutes_url = body.minutes_url == null ? null : String(body.minutes_url);
            }
        }

        // 確認：MANAGERのみ
        if ("manager_checked" in body) {
            if (role !== "MANAGER") throw new Error("forbidden: MANAGER only can update manager_checked");

            const v = body.manager_checked == null ? null : Boolean(body.manager_checked);
            patch.manager_checked = v;
            patch.manager_checked_at = v == null ? null : nowIso;
            patch.manager_checked_by = v == null ? null : myUserId;
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

export async function PATCH(req: NextRequest) {
    try {
        return await updateAttendance(req);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}
