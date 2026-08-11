//api/cron/staff-monthly-score-summaries/route.ts
//当月のみ更新変更箇所1
import { NextRequest, NextResponse } from "next/server";
//指定月のみ更新変更箇所1
//mport { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
    getPerformanceBadge,
    isNewPerformanceSchemeOfficial,
} from "@/lib/performanceScoreBadge";

const EXCLUDED_PERFORMANCE_SCORE_USER_IDS = [
    "satominishio",
    "jundakusanoda",
    "shinomasuda",
];

type SummaryRow = {
    id: string;
    target_month: string;
    user_id: string;
    entry_id: string | null;
    staff_name: string | null;
    service_hours: number | string | null;
    visit_record_total_count: number | null;
    houmon_same_day_done_count: number | null;
    houmon_late_done_count: number | null;
    visit_record_current_month_incomplete_count: number | null;
    visit_record_deadline_miss_count: number | null;
    visit_record_past_incomplete_count: number | null;
    meeting_previous_month_attended: boolean | null;
    meeting_past_attended: boolean | null;
    jisseki_previous_month_total_count: number | null;
    jisseki_previous_month_done_count: number | null;
    jisseki_past_incomplete_count: number | null;

    jisseki_team_total_count: number | null;
    jisseki_team_done_count: number | null;
    jisseki_team_collection_rate: number | string | null;
    jisseki_team_bonus_score: number | null;
    training_goal_selected_count: number | null;
    health_check_done: boolean | null;
    shift_decline_3days_count: number | null;
    shift_decline_6hours_count: number | null;
    shift_decline_penalty_score: number | null;
    team_orgunitid: string | null;
    individual_score: number | null;
    team_score: number | null;
    official_total_score: number | null;
    projected_total_score: number | null;
    projected_medal_rank: string | null;
};

type ShiftRecordViewRow = {
    shift_id: string | number | null;
    client_name: string | null;
    shift_start_date: string | null;
    shift_start_time: string | null;
    shift_end_date: string | null;
    shift_end_time: string | null;
    kaipoke_cs_id: string | null;
    staff_01_user_id: string | null;
    staff_01_role_code: string | null;
    staff_02_user_id: string | null;
    staff_02_role_code: string | null;
    staff_03_user_id: string | null;
    staff_03_role_code: string | null;
    staff_02_attend_flg: boolean | null;
    staff_03_attend_flg: boolean | null;
    record_status: string | null;
    record_created_at: string | null;
};

type DeadlineMissLogRow = { staff_id: string; action_detail: string | null };
type DeadlineMissRecorder = {
    rpc: (
        functionName: "record_visit_record_deadline_miss",
        args: { p_staff_id: string; p_action_at: string; p_action_detail: string }
    ) => Promise<{ error: { message: string } | null }>;
};

const VISIT_RECORD_DEADLINE_EVENT = "[VISIT_RECORD_DEADLINE_MISS]";
const VISIT_RECORD_DEADLINE_REGISTERED_BY = "cron:visit-record-deadline";

type IncompleteCount = {
    currentMonth: number;
    past: number;
};

type ShiftDeclinePenaltyCount = {
    within3Days: number;
    within6Hours: number;
};

/*type AuditLogDisplayRow = {
    audit_id: string;
    actor_user_id_text: string | null;
    created_at: string | null;
    shift_start_date: string | null;
    shift_start_time: string | null;
    before_row: unknown;
    after_row: unknown;
    changed_cols: unknown;
    action: string | null;
    penalty_level: string | null;
};*/

type AuditLogPenaltyRow = {
    id: string;
    actor_user_id: string | null;
    created_at: string | null;
    penalty_level: string | null;
};

type DisabilityCheckRow = {
    year_month: string | null;
    application_check: boolean | null;
    asigned_jisseki_staff_id: string | null;
    asigned_jisseki_staff_name: string | null;
    kaipoke_cs_id: string | null;
    client_name: string | null;
    kaipoke_servicek: string | null;
};

type DashboardTeamServiceHoursRow = {
    year_month: string | null;
    orgunitid: string | null;
    orgunitname: string | null;
    value: number | string | null;
};

type TeamScoreDetail = {
    id: string;
    clientId: string | null;
    clientName: string | null;
    targetDate: string;
    staffUserIds: string[];
    staffNames: string[];
    reason: string;
};

function getNextMonthStartDate(targetMonth: string) {
    const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
    const nextMonth = new Date(year, month, 1);

    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
}

function getJissekiBaseYearMonth() {
    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const day = jst.getDate();

    const targetDate =
        day <= 10
            ? new Date(year, month - 3, 1)
            : new Date(year, month - 2, 1);

    return `${targetDate.getFullYear()}-${String(
        targetDate.getMonth() + 1
    ).padStart(2, "0")}`;
}

function addIncompleteCount(
    map: Map<string, IncompleteCount>,
    userId: string,
    type: "currentMonth" | "past"
) {
    if (!userId) return;

    const current = map.get(userId) ?? {
        currentMonth: 0,
        past: 0,
    };

    current[type] += 1;
    map.set(userId, current);
}

function addShiftDeclinePenaltyCount(
    map: Map<string, ShiftDeclinePenaltyCount>,
    userId: string,
    type: "within3Days" | "within6Hours"
) {
    if (!userId) return;

    const current = map.get(userId) ?? {
        within3Days: 0,
        within6Hours: 0,
    };

    current[type] += 1;
    map.set(userId, current);
}

async function fetchShiftDeclinePenaltyMap(
    targetMonth: string,
    nextMonthStart: string
) {
    const { data, error } = await supabaseAdmin
        .from("audit_log")
        .select("id, actor_user_id, created_at, penalty_level")
        .gte("created_at", targetMonth)
        .lt("created_at", nextMonthStart)
        .in("penalty_level", ["moderate", "severe"])
        .returns<AuditLogPenaltyRow[]>();

    if (error) {
        throw error;
    }

    const actorAuthUserIds = Array.from(
        new Set(
            (data ?? [])
                .map((row) => row.actor_user_id)
                .filter((id): id is string => Boolean(id))
        )
    );

    if (actorAuthUserIds.length === 0) {
        return new Map<string, ShiftDeclinePenaltyCount>();
    }

    const { data: userRows, error: userError } = await supabaseAdmin
        .from("users")
        .select("auth_user_id, user_id")
        .in("auth_user_id", actorAuthUserIds)
        .returns<{ auth_user_id: string | null; user_id: string | null }[]>();

    if (userError) {
        throw userError;
    }

    const authUserIdToUserIdMap = new Map<string, string>();

    for (const user of userRows ?? []) {
        if (!user.auth_user_id || !user.user_id) continue;
        authUserIdToUserIdMap.set(user.auth_user_id, user.user_id);
    }

    const map = new Map<string, ShiftDeclinePenaltyCount>();

    for (const row of data ?? []) {
        if (!row.actor_user_id) continue;

        const userId = authUserIdToUserIdMap.get(row.actor_user_id);
        if (!userId) continue;

        if (row.penalty_level === "severe") {
            addShiftDeclinePenaltyCount(map, userId, "within6Hours");
        } else if (row.penalty_level === "moderate") {
            addShiftDeclinePenaltyCount(map, userId, "within3Days");
        }
    }

    return map;
}

//指定月のみ更新変更箇所2 以下をコメントアウト
function getTargetMonth(req: NextRequest) {
    const ym = req.nextUrl.searchParams.get("ym");

    if (ym && /^\d{4}-\d{2}$/.test(ym)) {
        return `${ym}-01`;
    }

    const now = new Date();
    const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));

    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;

    const targetDate = new Date(year, month - 1, 1);

    const targetYm = `${targetDate.getFullYear()}-${String(
        targetDate.getMonth() + 1
    ).padStart(2, "0")}`;

    if (targetYm < "2026-05") {
        return "2026-05-01";
    }

    return `${targetYm}-01`;
}

async function fetchAllShiftRows(
    fromDate: string,
    toDate: string,
    selectShiftColumns: string
): Promise<ShiftRecordViewRow[]> {
    const pageSize = 1000;
    let from = 0;
    const allRows: ShiftRecordViewRow[] = [];

    while (true) {
        const { data, error } = await supabaseAdmin
            .from("shift_shift_record_view")
            .select(selectShiftColumns)
            .gte("shift_start_date", fromDate)
            .lt("shift_start_date", toDate)
            .order("shift_start_date", { ascending: true })
            .range(from, from + pageSize - 1)
            .returns<ShiftRecordViewRow[]>();

        if (error) {
            throw error;
        }

        const rows = data ?? [];
        allRows.push(...rows);

        if (rows.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return allRows;
}

function calcShiftHours(shift: ShiftRecordViewRow) {
    if (!shift.shift_start_date || !shift.shift_start_time || !shift.shift_end_time) {
        return 0;
    }

    const start = new Date(`${shift.shift_start_date}T${shift.shift_start_time}`);
    const endDate = shift.shift_end_date || shift.shift_start_date;
    let end = new Date(`${endDate}T${shift.shift_end_time}`);

    if (end <= start) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }

    return Math.round(((end.getTime() - start.getTime()) / 1000 / 60 / 60) * 10) / 10;
}

function addServiceHours(
    map: Map<string, number>,
    userId: string | null,
    hours: number
) {
    if (!userId || hours <= 0) return;

    map.set(userId, Math.round(((map.get(userId) ?? 0) + hours) * 10) / 10);
}

function calcVisitRecordScore(row: SummaryRow) {
    const deadlineMissCount = Number(row.visit_record_deadline_miss_count ?? 0);
    const pastIncomplete = Number(row.visit_record_past_incomplete_count ?? 0);
    return Math.max(0, 20 - deadlineMissCount * 5 - pastIncomplete * 5);
}

function getJstDateTime(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return {
        date: `${value("year")}-${value("month")}-${value("day")}`,
        hour: Number(value("hour")),
        minute: Number(value("minute")),
    };
}

function getParticipatingUserIds(shift: ShiftRecordViewRow) {
    return Array.from(new Set([
        shift.staff_01_user_id,
        shift.staff_02_attend_flg === true ? shift.staff_02_user_id : null,
        shift.staff_03_attend_flg === true ? shift.staff_03_user_id : null,
    ].filter((userId): userId is string => Boolean(userId))));
}

function isVisitRecordComplete(status: string | null) {
    return status === "submitted" || status === "approved";
}

function calcTotalScore(row: SummaryRow) {
    const serviceHoursScore = Math.min(
        80,
        Math.floor(Number(row.service_hours ?? 0) / 20) * 10
    );

    const visitRecordScore = calcVisitRecordScore(row);

    const meetingScore =
        row.meeting_previous_month_attended === true ||
            row.meeting_past_attended === true
            ? 10
            : 0;

    const jissekiScore = Math.max(
        0,
        20 - Number(row.jisseki_past_incomplete_count ?? 0) * 5
    );

    const trainingGoalScore = Math.min(
        Number(row.training_goal_selected_count ?? 0) * 5,
        20
    );

    const healthCheckScore = row.health_check_done === true ? 10 : 0;

    const shiftDeclinePenaltyScore = Number(
        row.shift_decline_penalty_score ?? 0
    );

    return (
        serviceHoursScore +
        visitRecordScore +
        meetingScore +
        jissekiScore +
        trainingGoalScore +
        healthCheckScore -
        shiftDeclinePenaltyScore
    );
}

function getPreviousMonthStartDate(targetMonth: string) {
    const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
    const previousMonth = new Date(year, month - 2, 1);

    return `${previousMonth.getFullYear()}-${String(
        previousMonth.getMonth() + 1
    ).padStart(2, "0")}-01`;
}

function getFiscalYearRangeByTargetMonth(targetMonth: string) {
    const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
    const fiscalYear = month >= 4 ? year : year - 1;

    return {
        fiscalYear,
        startDate: `${fiscalYear}-04-01`,
        endDate: `${fiscalYear + 1}-03-31`,
    };
}

//当月のみ更新変更箇所３
export async function GET(req: NextRequest) {
    //指定月のみ更新変更箇所3
    //export async function GET() {
    try {
        //指定月のみ更新変更箇所４
        //const targetMonth = "2026-05-01";
        //当月のみ更新変更箇所４
        const targetMonth = getTargetMonth(req);
        const {
            startDate: healthCheckFiscalStartDate,
            endDate: healthCheckFiscalEndDate,
        } = getFiscalYearRangeByTargetMonth(targetMonth);

        const { data: initialRows, error } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .select("*")
            .eq("target_month", targetMonth)
            .returns<SummaryRow[]>();

        if (error) {
            throw error;
        }

        let rows = (initialRows ?? []).filter(
            (row) => !EXCLUDED_PERFORMANCE_SCORE_USER_IDS.includes(row.user_id)
        );

        if (!rows || rows.length === 0) {
            const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);
            const previousMonthDate = new Date(year, month - 2, 1);
            const previousMonth = `${previousMonthDate.getFullYear()}-${String(
                previousMonthDate.getMonth() + 1
            ).padStart(2, "0")}-01`;

            const { data: previousRows, error: previousError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .select("*")
                .eq("target_month", previousMonth)
                .returns<SummaryRow[]>();

            if (previousError) {
                throw previousError;
            }

            const seedRows = (previousRows ?? []).map((row) => ({
                target_month: targetMonth,
                user_id: row.user_id,
                entry_id: row.entry_id,
                staff_name: row.staff_name,
                team_orgunitid: row.team_orgunitid,
                service_hours: 0,
                visit_record_total_count: 0,
                houmon_same_day_done_count: 0,
                houmon_late_done_count: 0,
                visit_record_current_month_incomplete_count: 0,
                visit_record_deadline_miss_count: 0,
                visit_record_past_incomplete_count: 0,
                meeting_previous_month_attended: false,
                meeting_past_attended: false,
                jisseki_previous_month_total_count: 0,
                jisseki_previous_month_done_count: 0,
                jisseki_past_incomplete_count: 0,

                jisseki_team_total_count: 0,
                jisseki_team_done_count: 0,
                jisseki_team_collection_rate: 0,
                jisseki_team_bonus_score: 0,
                training_goal_selected_count: 0,
                health_check_done: false,
                shift_decline_3days_count: 0,
                shift_decline_6hours_count: 0,
                shift_decline_penalty_score: 0,
                total_score: 0,
                rank_no: null,
                medal_rank: "ブロンズ",
                updated_at: new Date().toISOString(),
            }));

            if (seedRows.length > 0) {
                const { error: seedError } = await supabaseAdmin
                    .from("staff_monthly_score_summaries")
                    .upsert(seedRows, {
                        onConflict: "target_month,user_id",
                    });

                if (seedError) {
                    throw seedError;
                }

                const { data: createdRows, error: reloadError } = await supabaseAdmin
                    .from("staff_monthly_score_summaries")
                    .select("*")
                    .eq("target_month", targetMonth)
                    .returns<SummaryRow[]>();

                if (reloadError) {
                    throw reloadError;
                }

                rows = createdRows ?? [];
            }
        }


        const existingUserIds = new Set(rows.map((row) => row.user_id));

        const { data: userRows, error: userRowsError } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select("user_id, entry_id, last_name_kanji, first_name_kanji, status, org_unit_id, orgunitname")
            .not("user_id", "is", null)
            .neq("status", "removed_from_lineworks_kaipoke")
            .not("orgunitname", "ilike", "%ケアプランセンター%");

        if (userRowsError) {
            throw userRowsError;
        }

        const uniqueUserMap = new Map<
            string,
            {
                user_id: string;
                entry_id: string | null;
                last_name_kanji: string | null;
                first_name_kanji: string | null;
                org_unit_id: string | null;
            }
        >();

        for (const user of userRows ?? []) {
            if (!user.user_id) continue;
            if (existingUserIds.has(user.user_id)) continue;
            if (EXCLUDED_PERFORMANCE_SCORE_USER_IDS.includes(user.user_id)) continue;

            if (!uniqueUserMap.has(user.user_id)) {
                uniqueUserMap.set(user.user_id, {
                    user_id: user.user_id,
                    entry_id: user.entry_id ?? null,
                    last_name_kanji: user.last_name_kanji ?? null,
                    first_name_kanji: user.first_name_kanji ?? null,
                    org_unit_id: user.org_unit_id ?? null,
                });
            }
        }

        const missingSeedRows = Array.from(uniqueUserMap.values()).map((user) => ({
            target_month: targetMonth,
            user_id: user.user_id,
            entry_id: user.entry_id,
            staff_name: `${user.last_name_kanji ?? ""}${user.first_name_kanji ?? ""}`,
            team_orgunitid: user.org_unit_id,
            service_hours: 0,
            visit_record_total_count: 0,
            houmon_same_day_done_count: 0,
            houmon_late_done_count: 0,
            visit_record_current_month_incomplete_count: 0,
            visit_record_deadline_miss_count: 0,
            visit_record_past_incomplete_count: 0,
            meeting_previous_month_attended: false,
            meeting_past_attended: false,
            jisseki_previous_month_total_count: 0,
            jisseki_previous_month_done_count: 0,
            jisseki_past_incomplete_count: 0,

            jisseki_team_total_count: 0,
            jisseki_team_done_count: 0,
            jisseki_team_collection_rate: 0,
            jisseki_team_bonus_score: 0,
            training_goal_selected_count: 0,
            health_check_done: false,
            shift_decline_3days_count: 0,
            shift_decline_6hours_count: 0,
            shift_decline_penalty_score: 0,
            total_score: 0,
            rank_no: null,
            medal_rank: "ブロンズ",
            updated_at: new Date().toISOString(),
        }));

        if (missingSeedRows.length > 0) {
            const { error: missingSeedError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .upsert(missingSeedRows, {
                    onConflict: "target_month,user_id",
                });

            if (missingSeedError) {
                throw missingSeedError;
            }

            const { data: reloadedRows, error: reloadRowsError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .select("*")
                .eq("target_month", targetMonth)
                .returns<SummaryRow[]>();

            if (reloadRowsError) {
                throw reloadRowsError;
            }

            rows = reloadedRows ?? [];
        }

        if (error) {
            throw error;
        }




        //const todayDate = getJstTodayDateString();

        const nextMonthStart = getNextMonthStartDate(targetMonth);

        const [year, month] = targetMonth.slice(0, 7).split("-").map(Number);

        const trainingMonthStart = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
        const trainingMonthEnd = new Date(Date.UTC(year, month, 1, -9, 0, 0));

        const entryIds = Array.from(
            new Set(
                rows
                    .map((row) => row.entry_id)
                    .filter((id): id is string => Boolean(id))
            )
        );

        const trainingGoalCountMap = new Map<string, number>();
        const healthCheckDoneUserIdMap = new Map<string, boolean>();

        const MANUAL_HEALTH_CHECK_DONE_USER_IDS_2026 = [
            "rikaueda",
            "mikaimamichi",
            "chieinagaki",
            "masaakinakamura",
            "wakanahorita",
            "sayurihatasa",
            "ryoukisuzuki",
        ];

        const userIds = Array.from(
            new Set(
                rows
                    .map((row) => row.user_id)
                    .filter((userId): userId is string => Boolean(userId))
            )
        );

        if (userIds.length > 0) {
            const { data: healthType, error: healthTypeError } = await supabaseAdmin
                .from("wf_request_type")
                .select("id")
                .eq("code", "health_check")
                .maybeSingle();

            if (healthTypeError) {
                throw healthTypeError;
            }

            if (healthType?.id) {
                const { data: healthRequests, error: healthRequestError } =
                    await supabaseAdmin
                        .from("wf_request")
                        .select("id, applicant_user_id, payload")
                        .in("applicant_user_id", userIds)
                        .eq("request_type_id", healthType.id)
                        .in("status", ["submitted", "approved"]);

                if (healthRequestError) {
                    throw healthRequestError;
                }

                const healthRequestIds = (healthRequests ?? []).map((r) => r.id);

                if (healthRequestIds.length > 0) {
                    const { data: healthAttachments, error: healthAttachmentError } =
                        await supabaseAdmin
                            .from("wf_request_attachment")
                            .select("request_id")
                            .in("request_id", healthRequestIds)
                            .eq("kind", "health_result");

                    if (healthAttachmentError) {
                        throw healthAttachmentError;
                    }

                    const submittedHealthRequestIds = new Set(
                        (healthAttachments ?? []).map((a) => a.request_id)
                    );

                    for (const req of healthRequests ?? []) {
                        if (!req.applicant_user_id) continue;
                        if (!submittedHealthRequestIds.has(req.id)) continue;

                        const payload = req.payload as Record<string, unknown> | null;
                        const healthCheckDate = String(payload?.health_check_date ?? "");

                        if (
                            healthCheckDate < healthCheckFiscalStartDate ||
                            healthCheckDate > healthCheckFiscalEndDate
                        ) {
                            continue;
                        }

                        healthCheckDoneUserIdMap.set(req.applicant_user_id, true);
                    }
                }
            }
        }

        const fiscalYear =
            Number(targetMonth.slice(5, 7)) >= 4
                ? Number(targetMonth.slice(0, 4))
                : Number(targetMonth.slice(0, 4)) - 1;

        if (fiscalYear === 2026) {
            for (const userId of MANUAL_HEALTH_CHECK_DONE_USER_IDS_2026) {
                healthCheckDoneUserIdMap.set(userId, true);
            }
        }

        if (entryIds.length > 0) {
            const { data: trainingRows, error: trainingError } = await supabaseAdmin
                .from("employee_training_goals")
                .select("entry_id")
                .in("entry_id", entryIds)
                .eq("row_type", "goal")
                .eq("selected", true)
                .eq("watched", true)
                .gte("updated_at", trainingMonthStart.toISOString())
                .lt("updated_at", trainingMonthEnd.toISOString());

            if (trainingError) {
                throw trainingError;
            }

            for (const trainingRow of trainingRows ?? []) {
                const entryId = trainingRow.entry_id;
                if (!entryId) continue;

                trainingGoalCountMap.set(
                    entryId,
                    (trainingGoalCountMap.get(entryId) ?? 0) + 1
                );
            }
        }

        const shiftDeclinePenaltyMap = await fetchShiftDeclinePenaltyMap(
            targetMonth,
            nextMonthStart
        );
        /*
        const currentMonthEndDate =
            todayDate < nextMonthStart ? todayDate : nextMonthStart;
            */

        const selectShiftColumns =
            "shift_id, client_name, shift_start_date, shift_start_time, shift_end_date, shift_end_time, kaipoke_cs_id, staff_01_user_id, staff_01_role_code, staff_02_user_id, staff_02_role_code, staff_03_user_id, staff_03_role_code, staff_02_attend_flg, staff_03_attend_flg, record_status, record_created_at";

        const currentMonthShiftRows = await fetchAllShiftRows(
            targetMonth,
            nextMonthStart,
            selectShiftColumns
        );

        const pastShiftRows = await fetchAllShiftRows(
            "2025-11-01",
            targetMonth,
            selectShiftColumns
        );

        // 締切違反は、過去月の再計算では作らず、実際の23:43 JST実行時だけ確定する。
        const jstNow = getJstDateTime();
        const isLiveDeadlineRun =
            !req.nextUrl.searchParams.has("ym") &&
            jstNow.hour === 23 &&
            jstNow.minute === 43;

        if (isLiveDeadlineRun) {
            const todayRows = await fetchAllShiftRows(
                jstNow.date,
                getNextMonthStartDate(jstNow.date.slice(0, 7) + "-01"),
                selectShiftColumns
            );
            const todaysShifts = todayRows.filter((shift) => shift.shift_start_date === jstNow.date);
            const participantUserIds = Array.from(new Set(
                todaysShifts.flatMap((shift) => getParticipatingUserIds(shift))
            ));

            if (participantUserIds.length > 0) {
                const { data: entryRows, error: entryError } = await supabaseAdmin
                    .from("user_entry_united_view_single")
                    .select("user_id, entry_id")
                    .in("user_id", participantUserIds);

                if (entryError) throw entryError;

                const entryIdByUserId = new Map<string, string>();
                for (const entry of entryRows ?? []) {
                    if (entry.user_id && entry.entry_id && !entryIdByUserId.has(entry.user_id)) {
                        entryIdByUserId.set(entry.user_id, entry.entry_id);
                    }
                }

                const actionAt = `${jstNow.date} 23:43:00`;
                const deadlineMissRows = todaysShifts
                    .filter((shift) => shift.shift_id && !isVisitRecordComplete(shift.record_status))
                    .flatMap((shift) => getParticipatingUserIds(shift).map((userId) => {
                        const entryId = entryIdByUserId.get(userId);
                        if (!entryId) return null;
                        return {
                            staff_id: entryId,
                            action_at: actionAt,
                            action_detail: `${VISIT_RECORD_DEADLINE_EVENT} shift_id=${shift.shift_id} shift_date=${jstNow.date} penalty=-5 reason=23:43時点で訪問記録未完了`,
                            registered_by: VISIT_RECORD_DEADLINE_REGISTERED_BY,
                        };
                    }))
                    .filter((row): row is NonNullable<typeof row> => row !== null);

                if (deadlineMissRows.length > 0) {
                    const recorder = supabaseAdmin as unknown as DeadlineMissRecorder;
                    const results = await Promise.all(deadlineMissRows.map((row) =>
                        recorder.rpc("record_visit_record_deadline_miss", {
                            p_staff_id: row.staff_id,
                            p_action_at: row.action_at,
                            p_action_detail: row.action_detail,
                        })
                    ));
                    const deadlineMissError = results.find((result) => result.error)?.error;
                    if (deadlineMissError) throw new Error(deadlineMissError.message);
                }
            }
        }

        const shiftRecordRows = [
            ...currentMonthShiftRows,
            ...pastShiftRows,
        ];

        const incompleteCountMap = new Map<string, IncompleteCount>();
        const visitTotalCountMap = new Map<string, number>();
        const houmonSameDayDoneCountMap = new Map<string, number>();
        const houmonLateDoneCountMap = new Map<string, number>();
        const visitCurrentMonthIncompleteCountMap = new Map<string, number>();
        const visitDeadlineMissCountMap = new Map<string, number>();

        const entryIdToUserId = new Map<string, string>();
        for (const row of rows) {
            if (row.entry_id) entryIdToUserId.set(row.entry_id, row.user_id);
        }
        for (const user of userRows ?? []) {
            if (user.entry_id && user.user_id && !entryIdToUserId.has(user.entry_id)) {
                entryIdToUserId.set(user.entry_id, user.user_id);
            }
        }
        const { data: deadlineMissLogs, error: deadlineMissLogsError } = await supabaseAdmin
            .from("staff_log")
            .select("staff_id, action_detail")
            .eq("registered_by", VISIT_RECORD_DEADLINE_REGISTERED_BY)
            .gte("action_at", targetMonth)
            .lt("action_at", nextMonthStart)
            .like("action_detail", `${VISIT_RECORD_DEADLINE_EVENT}%`)
            .returns<DeadlineMissLogRow[]>();

        if (deadlineMissLogsError) throw deadlineMissLogsError;
        for (const log of deadlineMissLogs ?? []) {
            const userId = entryIdToUserId.get(log.staff_id);
            if (userId) {
                visitDeadlineMissCountMap.set(
                    userId,
                    (visitDeadlineMissCountMap.get(userId) ?? 0) + 1
                );
            }
        }

        const serviceHoursMap = new Map<string, number>();
        const userTeamMap = new Map<string, string>();
        const staffNameMap = new Map<string, string>();
        const teamNameMap = new Map<string, string>();
        for (const user of userRows ?? []) {
            if (!user.user_id) continue;
            staffNameMap.set(
                user.user_id,
                `${user.last_name_kanji ?? ""}${user.first_name_kanji ?? ""}` || user.user_id
            );
            if (!user.org_unit_id) continue;
            userTeamMap.set(user.user_id, user.org_unit_id);
            if (user.orgunitname) teamNameMap.set(user.org_unit_id, user.orgunitname);
        }
        // 一度保存した月次所属スナップショットは、過去月再計算でも現在所属で上書きしない。
        for (const row of rows) {
            if (row.team_orgunitid) userTeamMap.set(row.user_id, row.team_orgunitid);
        }
        const teamIds = Array.from(new Set(userTeamMap.values()));
        if (teamIds.length > 0) {
            const { data: orgRows, error: orgRowsError } = await supabaseAdmin
                .from("orgs")
                .select("orgunitid, orgunitname")
                .in("orgunitid", teamIds);
            if (orgRowsError) throw orgRowsError;
            for (const org of orgRows ?? []) {
                teamNameMap.set(org.orgunitid, org.orgunitname);
            }
        }

        const previousMonthStart = getPreviousMonthStartDate(targetMonth);
        const teamServiceHoursMap = new Map<string, number>();
        const teamPreviousServiceHoursMap = new Map<string, number>();
        const teamVisitShiftIdsMap = new Map<string, Set<string>>();
        const teamDeadlineMissShiftIdsMap = new Map<string, Set<string>>();
        const teamJissekiTotalMap = new Map<string, number>();
        const teamJissekiIncompleteMap = new Map<string, number>();
        const teamJissekiIncompleteDetailsMap = new Map<string, TeamScoreDetail[]>();
        const teamVisitDeadlineMissDetailsMap = new Map<string, TeamScoreDetail[]>();
const teamVisitIncompleteDetailsMap = new Map<string, TeamScoreDetail[]>();
        // このビュー側でテスト利用者、同行、キャンセル等の除外条件が適用される。
        const targetYearMonth = targetMonth.slice(0, 7).replace("-", "");
        const previousYearMonth = previousMonthStart.slice(0, 7).replace("-", "");
        const { data: dashboardTeamHoursRows, error: dashboardTeamHoursError } = await supabaseAdmin
            .from("biz_stats_shift_sum_display_view")
            .select("year_month, orgunitid, orgunitname, value")
            .eq("metric", "team_service_hours")
            .eq("displaylevel", 3)
            .in("year_month", [targetYearMonth, previousYearMonth])
            .returns<DashboardTeamServiceHoursRow[]>();

        if (dashboardTeamHoursError) throw dashboardTeamHoursError;

        for (const row of dashboardTeamHoursRows ?? []) {
            if (!row.orgunitid || !row.year_month) continue;
            const hours = Math.round(Number(row.value ?? 0) * 10) / 10;
            if (row.year_month === targetYearMonth) {
                teamServiceHoursMap.set(row.orgunitid, hours);
            } else if (row.year_month === previousYearMonth) {
                teamPreviousServiceHoursMap.set(row.orgunitid, hours);
            }
            if (row.orgunitname) teamNameMap.set(row.orgunitid, row.orgunitname);
        }

        for (const log of deadlineMissLogs ?? []) {
            const userId = entryIdToUserId.get(log.staff_id);
            const teamId = userId ? userTeamMap.get(userId) : null;
            const shiftId = log.action_detail?.match(/\bshift_id=([^\s]+)/)?.[1];
            if (!teamId || !shiftId) continue;
            const shiftIds = teamDeadlineMissShiftIdsMap.get(teamId) ?? new Set<string>();
            shiftIds.add(shiftId);
            teamDeadlineMissShiftIdsMap.set(teamId, shiftIds);
        }

        const currentShiftById = new Map<string, ShiftRecordViewRow>();
        for (const shift of currentMonthShiftRows) {
            if (shift.shift_id != null) currentShiftById.set(String(shift.shift_id), shift);
        }
        for (const [teamId, shiftIds] of teamDeadlineMissShiftIdsMap) {
            const details: TeamScoreDetail[] = [];
            for (const shiftId of shiftIds) {
                const shift = currentShiftById.get(shiftId);
                const staffUserIds = shift ? getParticipatingUserIds(shift) : [];
                details.push({
                    id: `visit-deadline:${shiftId}`,
                    clientId: shift?.kaipoke_cs_id ?? null,
                    clientName: shift?.client_name ?? null,
                    targetDate: shift?.shift_start_date ?? targetMonth.slice(0, 7),
                    staffUserIds,
                    staffNames: staffUserIds.map((userId) => staffNameMap.get(userId) ?? userId),
                    reason: "23:43時点で訪問記録が未完了",
                });
            }
            teamVisitDeadlineMissDetailsMap.set(teamId, details);
        }

        for (const shift of currentMonthShiftRows) {
            if (!shift.shift_id || !shift.shift_start_date || String(shift.kaipoke_cs_id ?? "").startsWith("9999999")) continue;
            const isIncomplete = !isVisitRecordComplete(shift.record_status);
            if (!isIncomplete) continue;
            const participatingUserIds = getParticipatingUserIds(shift);
            for (const userId of participatingUserIds) {
                const teamId = userTeamMap.get(userId);
                if (!teamId) continue;
                const details = teamVisitIncompleteDetailsMap.get(teamId) ?? [];
                details.push({
                    id: `visit-incomplete:${shift.shift_id}:${userId}`,
                    clientId: shift.kaipoke_cs_id ?? null,
                    clientName: shift.client_name ?? null,
                    targetDate: shift.shift_start_date,
                    staffUserIds: [userId],
                    staffNames: [staffNameMap.get(userId) ?? userId],
                    reason: "当日未完了",
                });
                teamVisitIncompleteDetailsMap.set(teamId, details);
            }
        }
        const jissekiPreviousMonthTotalMap = new Map<string, number>();
        const jissekiPreviousMonthDoneMap = new Map<string, number>();
        const jissekiPastIncompleteMap = new Map<string, number>();

        const jissekiBaseYearMonth = getJissekiBaseYearMonth();

        const meetingPreviousMonthAttendedMap = new Map<string, boolean>();
        const meetingEligibleUserIds = new Set<string>();

        for (const shift of pastShiftRows) {
            if (
                shift.shift_start_date &&
                shift.shift_start_date >= previousMonthStart &&
                shift.shift_start_date < targetMonth &&
                !String(shift.kaipoke_cs_id ?? "").startsWith("9999999")
            ) {
                for (const userId of getParticipatingUserIds(shift)) {
                    meetingEligibleUserIds.add(userId);
                }
            }
        }

        const previousMeetingMonth = getPreviousMonthStartDate(targetMonth);

        const { data: meetingRows, error: meetingError } = await supabaseAdmin
            .from("monthly_meeting_attendance")
            .select("user_id, attended_regular, attended_extra, checked_regular, checked_extra")
            .eq("target_month", previousMeetingMonth);

        if (meetingError) {
            throw meetingError;
        }

        for (const row of meetingRows ?? []) {
            const attended =
                row.attended_regular === true ||
                row.attended_extra === true ||
                row.checked_regular === true ||
                row.checked_extra === true;

            meetingPreviousMonthAttendedMap.set(row.user_id, attended);
        }

        const { data: disabilityRows, error: disabilityError } = await supabaseAdmin
            .from("disability_check_view")
            .select("year_month, application_check, asigned_jisseki_staff_id, asigned_jisseki_staff_name, kaipoke_cs_id, client_name, kaipoke_servicek")
            .not("asigned_jisseki_staff_id", "is", null)
            .gte("year_month", "2025-11")
            .lte("year_month", jissekiBaseYearMonth)
            .range(0, 9999)
            .returns<DisabilityCheckRow[]>();

        if (disabilityError) {
            throw disabilityError;
        }


        for (const row of disabilityRows ?? []) {
            const staffId = row.asigned_jisseki_staff_id;

            if (!staffId || !row.year_month) {
                continue;
            }

            const teamId = userTeamMap.get(staffId);
            if (teamId) {
                teamJissekiTotalMap.set(teamId, (teamJissekiTotalMap.get(teamId) ?? 0) + 1);
                if (row.application_check === false) {
                    teamJissekiIncompleteMap.set(
                        teamId,
                        (teamJissekiIncompleteMap.get(teamId) ?? 0) + 1
                    );
                    const details = teamJissekiIncompleteDetailsMap.get(teamId) ?? [];
                    details.push({
                        id: `jisseki:${row.year_month}:${row.kaipoke_cs_id ?? "unknown"}:${staffId}:${details.length}`,
                        clientId: row.kaipoke_cs_id,
                        clientName: row.client_name,
                        targetDate: row.year_month,
                        staffUserIds: [staffId],
                        staffNames: [row.asigned_jisseki_staff_name ?? staffNameMap.get(staffId) ?? staffId],
                        reason: `${row.kaipoke_servicek ? `${row.kaipoke_servicek}・` : ""}実績記録が未提出`,
                    });
                    teamJissekiIncompleteDetailsMap.set(teamId, details);
                }
            }

            /*
             * 対象月の実績記録は、完了・未完了を問わず
             * チーム回収率の対象件数に含める
             */
            if (row.year_month === jissekiBaseYearMonth) {
                jissekiPreviousMonthTotalMap.set(
                    staffId,
                    (jissekiPreviousMonthTotalMap.get(staffId) ?? 0) + 1
                );

                if (row.application_check === true) {
                    jissekiPreviousMonthDoneMap.set(
                        staffId,
                        (jissekiPreviousMonthDoneMap.get(staffId) ?? 0) + 1
                    );
                }
            }

            /*
             * 個人スコア用の過去未完了件数
             */
            if (row.application_check === false) {
                jissekiPastIncompleteMap.set(
                    staffId,
                    (jissekiPastIncompleteMap.get(staffId) ?? 0) + 1
                );
            }
        }

        for (const shift of shiftRecordRows ?? []) {
            if (String(shift.kaipoke_cs_id ?? "").startsWith("9999999")) {
                continue;
            }

            if (
                shift.shift_start_date &&
                shift.shift_start_date >= targetMonth &&
                shift.shift_start_date < nextMonthStart
            ) {
                const hours = calcShiftHours(shift);
                const participatingUserIds = getParticipatingUserIds(shift);

                addServiceHours(serviceHoursMap, shift.staff_01_user_id, hours);

                if (shift.staff_02_attend_flg === true) {
                    addServiceHours(serviceHoursMap, shift.staff_02_user_id, hours);
                }

                if (shift.staff_03_attend_flg === true) {
                    addServiceHours(serviceHoursMap, shift.staff_03_user_id, hours);
                }

                for (const userId of participatingUserIds) {
                    const teamId = userTeamMap.get(userId);
                    if (!teamId) continue;
                    if (shift.shift_id) {
                        const shiftIds = teamVisitShiftIdsMap.get(teamId) ?? new Set<string>();
                        shiftIds.add(String(shift.shift_id));
                        teamVisitShiftIdsMap.set(teamId, shiftIds);
                    }
                }
            }

            if (
                shift.shift_start_date &&
                shift.shift_start_date >= previousMonthStart &&
                shift.shift_start_date < targetMonth
            ) {
                // チームの前月サービス時間はダッシュボード集計値を利用する。
            }

            if (
                shift.shift_start_date &&
                shift.shift_start_date >= targetMonth &&
                shift.shift_start_date < nextMonthStart
            ) {
                const userIds = getParticipatingUserIds(shift);

                const isSubmitted = isVisitRecordComplete(shift.record_status);

                const recordCreatedDate = shift.record_created_at
                    ? new Date(shift.record_created_at)
                        .toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" })
                        .slice(0, 10)
                    : null;

                const isSameDayDone =
                    isSubmitted &&
                    recordCreatedDate !== null &&
                    recordCreatedDate <= shift.shift_start_date;

                const isLateDone =
                    isSubmitted &&
                    recordCreatedDate !== null &&
                    recordCreatedDate > shift.shift_start_date;

                for (const userId of userIds) {
                    visitTotalCountMap.set(
                        userId,
                        (visitTotalCountMap.get(userId) ?? 0) + 1
                    );

                    if (isSameDayDone) {
                        houmonSameDayDoneCountMap.set(
                            userId,
                            (houmonSameDayDoneCountMap.get(userId) ?? 0) + 1
                        );
                    } else if (isLateDone) {
                        houmonLateDoneCountMap.set(
                            userId,
                            (houmonLateDoneCountMap.get(userId) ?? 0) + 1
                        );
                    } else {
                        visitCurrentMonthIncompleteCountMap.set(
                            userId,
                            (visitCurrentMonthIncompleteCountMap.get(userId) ?? 0) + 1
                        );
                    }
                }
            }
            if (
                shift.shift_start_date &&
                shift.shift_start_date >= "2025-11-01" &&
                shift.shift_start_date < targetMonth
            ) {
                const isDone = isVisitRecordComplete(shift.record_status);

                if (!isDone) {
                    for (const userId of getParticipatingUserIds(shift)) {
                        addIncompleteCount(incompleteCountMap, userId, "past");
                    }
                }
            }
        }

        const teamScoreById = new Map<string, number>();
        const scoredTeamIds = teamIds.filter((teamId) => {
            const memberUserIds = Array.from(userTeamMap.entries())
                .filter(([userId, assignedTeamId]) =>
                    assignedTeamId === teamId && meetingEligibleUserIds.has(userId)
                )
                .map(([userId]) => userId);
            return (
                (teamServiceHoursMap.get(teamId) ?? 0) > 0 ||
                memberUserIds.length > 0 ||
                (teamJissekiIncompleteMap.get(teamId) ?? 0) > 0 ||
                (teamDeadlineMissShiftIdsMap.get(teamId)?.size ?? 0) > 0 ||
                (teamVisitIncompleteDetailsMap.get(teamId)?.length ?? 0) > 0
            );
        });
        const teamSummaryRows = scoredTeamIds
            .map((teamId) => {
                const memberUserIds = Array.from(userTeamMap.entries())
                    .filter(([userId, assignedTeamId]) =>
                        assignedTeamId === teamId && meetingEligibleUserIds.has(userId)
                    )
                    .map(([userId]) => userId);
                const serviceHours = teamServiceHoursMap.get(teamId) ?? 0;
                const previousServiceHours = teamPreviousServiceHoursMap.get(teamId) ?? 0;
                const serviceHoursGrowth = Math.round((serviceHours - previousServiceHours) * 10) / 10;
                const serviceHoursScore = Math.min(20, Math.max(0, Math.floor(serviceHoursGrowth / 10)));
                const jissekiTotalCount = teamJissekiTotalMap.get(teamId) ?? 0;
                const jissekiIncompleteCount = teamJissekiIncompleteMap.get(teamId) ?? 0;
                const jissekiScore = 20 - jissekiIncompleteCount;
                const visitRecordTotalCount = teamVisitShiftIdsMap.get(teamId)?.size ?? 0;
                const visitRecordDeadlineMissCount = teamDeadlineMissShiftIdsMap.get(teamId)?.size ?? 0;
                const visitRecordScore = Math.max(0, 20 - visitRecordDeadlineMissCount * 5);
                const meetingMemberCount = memberUserIds.length;
                const meetingAttendedCount = memberUserIds.filter(
                    (userId) => meetingPreviousMonthAttendedMap.get(userId) === true
                ).length;
                const meetingIncompleteCount = meetingMemberCount - meetingAttendedCount;
                const meetingIncompleteDetails: TeamScoreDetail[] = memberUserIds
                    .filter((userId) => meetingPreviousMonthAttendedMap.get(userId) !== true)
                    .map((userId) => ({
                        id: `meeting:${previousYearMonth}:${userId}`,
                        clientId: null,
                        clientName: null,
                        targetDate: previousMonthStart.slice(0, 7),
                        staffUserIds: [userId],
                        staffNames: [staffNameMap.get(userId) ?? userId],
                        reason: "前月会議の参加・確認なし",
                    }));
                // チーム会議点: 全員参加で10点。不参加・未確認1名につき1点減点。
                const meetingScore = 10 - meetingIncompleteCount;
                const teamScore = serviceHoursScore + jissekiScore + visitRecordScore + meetingScore;
                teamScoreById.set(teamId, teamScore);

                const jissekiSubmittedCount = Math.max(0, jissekiTotalCount - jissekiIncompleteCount);
                const visitRecordSameDayCount = Math.max(0, visitRecordTotalCount - visitRecordDeadlineMissCount);
                return {
                    target_month: targetMonth,
                    orgunitid: teamId,
                    orgunitname: teamNameMap.get(teamId) ?? teamId,
                    team_name: teamNameMap.get(teamId) ?? teamId,
                    member_count: meetingMemberCount,
                    meeting_member_count: meetingMemberCount,
                    meeting_attended_count: meetingAttendedCount,
                    meeting_incomplete_count: meetingIncompleteCount,
                    meeting_score: meetingScore,
                    service_hours: serviceHours,
                    previous_month_service_hours: previousServiceHours,
                    service_hours_current: serviceHours,
                    service_hours_previous: previousServiceHours,
                    service_hours_growth: serviceHoursGrowth,
                    service_hours_base_score: 0,
                    service_hours_growth_score: serviceHoursScore,
                    service_hours_score: serviceHoursScore,
                    jisseki_total_count: jissekiTotalCount,
                    jisseki_incomplete_count: jissekiIncompleteCount,
                    jisseki_incomplete_details: teamJissekiIncompleteDetailsMap.get(teamId) ?? [],
                    jisseki_target_count: jissekiTotalCount,
                    jisseki_submitted_count: jissekiSubmittedCount,
                    jisseki_submission_rate:
                        jissekiTotalCount > 0 ? (jissekiSubmittedCount / jissekiTotalCount) * 100 : 100,
                    jisseki_score: jissekiScore,
                    visit_record_total_count: visitRecordTotalCount,
                    visit_record_deadline_miss_count: visitRecordDeadlineMissCount,
                    visit_record_deadline_miss_details: teamVisitDeadlineMissDetailsMap.get(teamId) ?? [],
                    visit_record_incomplete_details: teamVisitIncompleteDetailsMap.get(teamId) ?? [],
                    visit_record_target_count: visitRecordTotalCount,
                    visit_record_same_day_count: visitRecordSameDayCount,
                    visit_record_submission_rate:
                        visitRecordTotalCount > 0 ? (visitRecordSameDayCount / visitRecordTotalCount) * 100 : 100,
                    visit_record_score: visitRecordScore,
                    meeting_incomplete_details: meetingIncompleteDetails,
                    team_score: teamScore,
                    total_score: teamScore,
                    updated_at: new Date().toISOString(),
                };
            })
            .sort((a, b) => b.team_score - a.team_score)
            .map((row, index) => ({ ...row, rank_no: index + 1 }));

        if (teamSummaryRows.length > 0) {
            const { error: teamSummaryError } = await supabaseAdmin
                .from("team_monthly_score_summaries")
                .upsert(teamSummaryRows, { onConflict: "target_month,orgunitid" });
            if (teamSummaryError) throw teamSummaryError;
        }

        const scoredRows = (rows ?? [])
            .map((row) => {
                const decline3DaysCount =
                    shiftDeclinePenaltyMap.get(row.user_id)?.within3Days ?? 0;

                const decline6HoursCount =
                    shiftDeclinePenaltyMap.get(row.user_id)?.within6Hours ?? 0;

                const shiftDeclinePenaltyScore =
                    decline3DaysCount * 5 + decline6HoursCount * 10;

                const trainingGoalSelectedCount =
                    row.entry_id ? trainingGoalCountMap.get(row.entry_id) ?? 0 : 0;

                const healthCheckDone =
                    healthCheckDoneUserIdMap.get(row.user_id) === true;

                const rowWithIncompleteCounts = {
                    ...row,
                    service_hours:
                        serviceHoursMap.get(row.user_id) ?? row.service_hours ?? 0,
                    visit_record_total_count:
                        visitTotalCountMap.get(row.user_id) ?? 0,
                    houmon_same_day_done_count:
                        houmonSameDayDoneCountMap.get(row.user_id) ?? 0,
                    houmon_late_done_count:
                        houmonLateDoneCountMap.get(row.user_id) ?? 0,
                    visit_record_current_month_incomplete_count:
                        visitCurrentMonthIncompleteCountMap.get(row.user_id) ?? 0,
                    visit_record_deadline_miss_count:
                        visitDeadlineMissCountMap.get(row.user_id) ?? 0,
                    visit_record_past_incomplete_count:
                        incompleteCountMap.get(row.user_id)?.past ?? 0,
                    jisseki_previous_month_total_count:
                        jissekiPreviousMonthTotalMap.get(row.user_id) ?? 0,

                    jisseki_previous_month_done_count:
                        jissekiPreviousMonthDoneMap.get(row.user_id) ?? 0,

                    jisseki_past_incomplete_count:
                        jissekiPastIncompleteMap.get(row.user_id) ?? 0,
                    training_goal_selected_count: trainingGoalSelectedCount,
                    health_check_done: healthCheckDone,
                    shift_decline_3days_count: decline3DaysCount,
                    shift_decline_6hours_count: decline6HoursCount,
                    shift_decline_penalty_score: shiftDeclinePenaltyScore,
                };

                const individualScore = calcTotalScore(rowWithIncompleteCounts);
                const teamOrgunitId = row.team_orgunitid ?? userTeamMap.get(row.user_id) ?? null;
                const teamScore = teamOrgunitId ? teamScoreById.get(teamOrgunitId) ?? 0 : 0;
                const projectedTotalScore = individualScore + teamScore;
                const newSchemeOfficial = isNewPerformanceSchemeOfficial(targetMonth);
                const officialTotalScore = newSchemeOfficial ? projectedTotalScore : individualScore;

                return {
                    ...rowWithIncompleteCounts,
                    team_orgunitid: teamOrgunitId,
                    individual_score: individualScore,
                    team_score: teamScore,
                    official_total_score: officialTotalScore,
                    projected_total_score: projectedTotalScore,
                    total_score: officialTotalScore,
                    medal_rank: getPerformanceBadge(
                        officialTotalScore,
                        newSchemeOfficial ? "new" : "current"
                    ).name,
                    projected_medal_rank: getPerformanceBadge(projectedTotalScore, "new").name,
                };
            })
            .sort((a, b) => b.total_score - a.total_score);

        const updates = scoredRows.map((row, index) => ({
            id: row.id,
            target_month: row.target_month,
            user_id: row.user_id,
            entry_id: row.entry_id,
            staff_name: row.staff_name,
            service_hours:
                serviceHoursMap.get(row.user_id) ?? row.service_hours ?? 0,
            visit_record_total_count:
                visitTotalCountMap.get(row.user_id) ?? 0,
            houmon_same_day_done_count: row.houmon_same_day_done_count ?? 0,
            houmon_late_done_count: row.houmon_late_done_count ?? 0,

            visit_record_current_month_incomplete_count:
                visitCurrentMonthIncompleteCountMap.get(row.user_id) ?? 0,

            visit_record_deadline_miss_count:
                visitDeadlineMissCountMap.get(row.user_id) ?? 0,

            visit_record_past_incomplete_count:
                incompleteCountMap.get(row.user_id)?.past ?? 0,
            meeting_previous_month_attended:
                meetingPreviousMonthAttendedMap.get(row.user_id) ?? false,
            meeting_past_attended: row.meeting_past_attended ?? false,
            jisseki_previous_month_total_count:
                jissekiPreviousMonthTotalMap.get(row.user_id) ?? 0,

            jisseki_previous_month_done_count:
                jissekiPreviousMonthDoneMap.get(row.user_id) ?? 0,

            jisseki_past_incomplete_count:
                jissekiPastIncompleteMap.get(row.user_id) ?? 0,
            training_goal_selected_count:
                row.entry_id ? trainingGoalCountMap.get(row.entry_id) ?? 0 : 0,
            health_check_done:
                healthCheckDoneUserIdMap.get(row.user_id) === true,
            shift_decline_3days_count:
                row.shift_decline_3days_count ?? 0,
            shift_decline_6hours_count:
                row.shift_decline_6hours_count ?? 0,
            shift_decline_penalty_score:
                row.shift_decline_penalty_score ?? 0,
            team_orgunitid: row.team_orgunitid,
            individual_score: row.individual_score,
            team_score: row.team_score,
            official_total_score: row.official_total_score,
            projected_total_score: row.projected_total_score,
            projected_medal_rank: row.projected_medal_rank,
            total_score: row.total_score,
            rank_no: index + 1,
            medal_rank: row.medal_rank,
            updated_at: new Date().toISOString(),
        }));

        if (updates.length > 0) {
            const { error: upsertError } = await supabaseAdmin
                .from("staff_monthly_score_summaries")
                .upsert(updates, {
                    onConflict: "target_month,user_id",
                });

            if (upsertError) {
                throw upsertError;
            }
        }
        return NextResponse.json({
            ok: true,
            target_month: targetMonth,
            jisseki_base_year_month: jissekiBaseYearMonth,
            disability_check_count: disabilityRows?.length ?? 0,
            jisseki_previous_month_done_user_count: jissekiPreviousMonthDoneMap.size,
            jisseki_past_incomplete_user_count: jissekiPastIncompleteMap.size,
            junkusano_past_incomplete:
                incompleteCountMap.get("junkusano")?.past ?? 0,
            junkusano_current_incomplete:
                visitCurrentMonthIncompleteCountMap.get("junkusano") ?? 0,
            updated_count: updates.length,
        });
    } catch (e: unknown) {
        console.error(e);

        return NextResponse.json(
            {
                ok: false,
                error: e instanceof Error ? e.message : "unknown error",
            },
            { status: 500 }
        );
    }
}
