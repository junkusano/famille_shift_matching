// src/lib/alert_add/monthly_meeting_unchecked_lineworks_alert.ts
// 月例会議：「月例」に未チェック → 翌月15日以降のみ 本人の「人事労務サポートルーム」へLINEWORKS通知

import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

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
    channel_id: string | null; // 人事労務サポートルーム
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    orgunitname: string | null;
};

export type MonthlyMeetingUncheckedLineworksResult = {
    enabled: boolean;
    scanned: number;
    targetRows: number;
    sentUsers: number;
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

function toErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "unknown error";
    }
}

function buildStaffName(row?: StaffInfoRow) {
    if (!row) return "";
    return `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim();
}

async function loadStaffInfoMap(userIds: string[]): Promise<Map<string, StaffInfoRow>> {
    if (!userIds.length) return new Map();

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, channel_id, last_name_kanji, first_name_kanji, orgunitname")
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

export async function runMonthlyMeetingUncheckedLineworksAlert(args: {
    dryRun?: boolean;
    targetUserId?: string;
    forceDay15Rule?: boolean;
} = {}): Promise<MonthlyMeetingUncheckedLineworksResult> {
    const dryRun = args.dryRun ?? false;

    const now = new Date();
    const day = now.getDate();

    // 例: 2026-04-15 なら 2026-03 分を対象
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetYm = ymNow(prev);
    const targetMonth = monthStartStrFromYm(targetYm);

    if (day < 15 && !args.forceDay15Rule) {
        return {
            enabled: true,
            scanned: 0,
            targetRows: 0,
            sentUsers: 0,
            errors: 0,
            dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: true,
        };
    }

    let q = supabaseAdmin
        .from("monthly_meeting_attendance")
        .select(
            "target_month, user_id, attended_regular, attended_extra, checked_regular, checked_extra, staff_comment"
        )
        .eq("target_month", targetMonth)
        .eq("attended_regular", false);

    if (args.targetUserId) {
        q = q.eq("user_id", args.targetUserId);
    }

    const { data, error } = await q;
    if (error) {
        throw new Error(`monthly_meeting_attendance select failed: ${error.message}`);
    }

    const rows = (data ?? []) as AttendanceRow[];
    const scanned = rows.length;

    if (!rows.length) {
        return {
            enabled: true,
            scanned,
            targetRows: 0,
            sentUsers: 0,
            errors: 0,
            dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: false,
        };
    }

    const userIds = Array.from(
        new Set(rows.map((r) => String(r.user_id ?? "").trim()).filter(Boolean))
    );

    const staffMap = await loadStaffInfoMap(userIds);
    const accessToken = await getAccessToken();

    let sentUsers = 0;
    let errors = 0;

    for (const row of rows) {
        const userId = String(row.user_id ?? "").trim();
        if (!userId) continue;

        try {
            const staff = staffMap.get(userId);
            if (!staff) throw new Error(`staff not found: user_id="${userId}"`);

            const channelId = String(staff.channel_id ?? "").trim();
            if (!channelId) {
                throw new Error(`channel_id not found for user_id="${userId}"`);
            }

            const staffName = buildStaffName(staff) || userId;
            const orgName = String(staff.orgunitname ?? "").trim();

            const detailUrl =
                `https://myfamille.shi-on.net/portal/monthly-meeting-check?ym=${encodeURIComponent(targetYm)}`;

            const message =
                `【月例会議 未対応】〈${formatYmJa(targetYm)}分〉\n` +
                `${staffName}さん\n` +
                `前月分の月例会議について、「月例」にチェックが入っていません。\n` +
                `月例会議に参加できていない場合は、追加開催をお願いします。\n\n` +
                `追加開催後は、月例会議ページで「追加」にチェックし、コメントを記入してください。\n` +
                `コメントは、会議内容に対する所感や気づきを記入してください。\n\n` +
                `チーム: ${orgName || "未設定"}\n` +
                `${detailUrl}`;

            if (!dryRun) {
                await sendLWBotMessage(channelId, message, accessToken);
            }

            sentUsers += 1;
        } catch (e: unknown) {
            errors += 1;
            console.error("[monthly_meeting_unchecked_lineworks] send error", {
                user_id: userId,
                error: toErrorMessage(e),
            });
        }
    }

    return {
        enabled: true,
        scanned,
        targetRows: rows.length,
        sentUsers,
        errors,
        dryRun,
        targetYearMonth: targetYm,
        skippedBecauseDay: false,
    };
}