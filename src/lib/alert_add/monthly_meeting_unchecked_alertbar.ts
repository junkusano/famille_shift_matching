// src/lib/alert_add/monthly_meeting_unchecked_alertbar.ts
// 月例会議：「月例」未チェック かつ 「追加」未チェック → 翌月20日以降のみアラートバー登録

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type AttendanceRow = {
    target_month: string; // YYYY-MM-01
    user_id: string;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    checked_regular: boolean | null;
    checked_extra: boolean | null;
    staff_comment: string | null;
};

type StaffInfoRow = {
    user_id: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    org_unit_id: string | null;
    orgunitname: string | null;
};

export type MonthlyMeetingUncheckedAlertbarResult = {
    enabled: boolean;
    scanned: number;
    targetRows: number;
    alertCount: number;
    errors: number;
    dryRun: boolean;
    targetYearMonth: string;
    skippedBecauseDay: boolean;
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function ymNow(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthStartStrFromYm(ym: string): string {
    return `${ym}-01`;
}

function formatYmJa(ym: string): string {
    const [y, m] = ym.split("-");
    return `${y}年${Number(m)}月`;
}

function monthDiff(base: Date, targetMonthStr: string): number {
    const target = new Date(`${targetMonthStr}T00:00:00`);
    return (
        (base.getFullYear() - target.getFullYear()) * 12 +
        (base.getMonth() - target.getMonth())
    );
}

function toErrorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function buildStaffName(row?: StaffInfoRow) {
    if (!row) return "";
    return `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim();
}

async function loadStaffInfoMap(userIds: string[]): Promise<Map<string, StaffInfoRow>> {
    if (!userIds.length) return new Map();

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, last_name_kanji, first_name_kanji, org_unit_id, orgunitname")
        .in("user_id", userIds);

    if (error) {
        throw new Error(`user_entry_united_view_single select failed: ${error.message}`);
    }

    const map = new Map<string, StaffInfoRow>();
    for (const row of (data ?? []) as StaffInfoRow[]) {
        const userId = String(row.user_id ?? "").trim();
        if (!userId) continue;
        map.set(userId, row);
    }
    return map;
}

export async function runMonthlyMeetingUncheckedAlertbar(args: {
    dryRun?: boolean;
    targetUserId?: string;
    forceDay20Rule?: boolean;
} = {}): Promise<MonthlyMeetingUncheckedAlertbarResult> {
    const dryRun = args.dryRun ?? false;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstTargetMonth = "2026-03-01";
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetYm = ymNow(prev);

    let q = supabaseAdmin
        .from("monthly_meeting_attendance")
        .select(
            "target_month, user_id, attended_regular, attended_extra, checked_regular, checked_extra, staff_comment"
        )
        .gte("target_month", firstTargetMonth)
        .lt("target_month", monthStartStrFromYm(ymNow(currentMonthStart)))
        .eq("attended_regular", false)
        .eq("attended_extra", false);

    if (args.targetUserId) {
        q = q.eq("user_id", args.targetUserId);
    }

    const { data, error } = await q;
    if (error) {
        throw new Error(`monthly_meeting_attendance select failed: ${error.message}`);
    }

    const rows = (data ?? []) as AttendanceRow[];
    const scanned = rows.length;

    const filteredRows = rows.filter((row) => {
        if (row.target_month < "2026-03-01") return false;

        const diff = monthDiff(now, row.target_month);

        if (diff <= 0) return false;

        if (diff === 1) {
            return now.getDate() >= 20;
        }

        return true;
    });

    if (!filteredRows.length) {
        return {
            enabled: true,
            scanned,
            targetRows: 0,
            alertCount: 0,
            errors: 0,
            dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: false,
        };
    }

    const userIds = Array.from(
        new Set(filteredRows.map((r) => String(r.user_id ?? "").trim()).filter(Boolean))
    );
    const staffMap = await loadStaffInfoMap(userIds);

    let alertCount = 0;
    let errors = 0;

    for (const row of filteredRows) {
        const userId = String(row.user_id ?? "").trim();
        if (!userId) continue;

        try {
            const staff = staffMap.get(userId);
            const staffName = buildStaffName(staff) || userId;
            const orgName = String(staff?.orgunitname ?? "").trim();

            const monthYm = row.target_month.slice(0, 7);

            const detailUrl =
                `https://myfamille.shi-on.net/portal/monthly-meeting-check?ym=${encodeURIComponent(monthYm)}`;

            const message =
                `【月例会議 未対応】〈${formatYmJa(monthYm)}分〉\n` +
                `<a href="${detailUrl}">${staffName}さん</a>\n` +
                `20日を過ぎても、月例会議の「月例」または「追加」にチェックが入っていません。\n` +
                `追加開催が未実施の可能性があります。至急ご確認ください。\n\n` +
                `チーム: ${orgName || "未設定"}`;

            if (!dryRun) {
                const orgUnitId = String(staff?.org_unit_id ?? "").trim();

                await ensureSystemAlert({
                    message,
                    shift_id: `monthly_meeting:unchecked:${monthYm}:${userId}`,
                    user_id: userId,
                    kaipoke_cs_id: null,
                    rpa_request_id: null,
                    assigned_org_id: orgUnitId || null,
                });
            }

            alertCount += 1;
        } catch (e: unknown) {
            errors += 1;
            console.error("[monthly_meeting_unchecked_alertbar] ensureSystemAlert error", {
                user_id: userId,
                error: toErrorMessage(e),
            });
        }
    }

    return {
        enabled: true,
        scanned,
        targetRows: filteredRows.length,
        alertCount,
        errors,
        dryRun,
        targetYearMonth: targetYm,
        skippedBecauseDay: false,
    };
}