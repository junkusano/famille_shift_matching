import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
    parseMonthlyMeetingAlertKey,
    shouldResolveMonthlyMeetingAlert,
} from "@/lib/monthlyMeeting/eligibility";
import { hasStaffShiftInMonth } from "@/lib/monthlyMeeting/shiftEligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
    ok: boolean;
    updatedCount?: number;
    skippedCount?: number;
    error?: string;
};

type StaffEntryRow = {
    user_id: string | null;
    entry_date_original: string | null;
    entry_date_latest: string | null;
};

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        console.info("[cron][alert-reset-monthly-meeting-unchecked] start");

        const nowIso = new Date().toISOString();

        const { data: openRows, error: openError } = await supabaseAdmin
            .from("alert_log")
            .select("id, shift_id")
            .eq("status", "open")
            .in("status_source", ["system"])
            .like("shift_id", "monthly_meeting:unchecked:%");

        if (openError) {
            throw new Error(
                `message=${openError.message}, details=${openError.details ?? ""}, hint=${openError.hint ?? ""}, code=${openError.code ?? ""}`
            );
        }

        const alertKeys = (openRows ?? [])
            .map((row) => ({ row, key: parseMonthlyMeetingAlertKey(row.shift_id) }))
            .filter(
                (item): item is { row: { id: string; shift_id: string }; key: NonNullable<ReturnType<typeof parseMonthlyMeetingAlertKey>> } =>
                    item.key !== null,
            );
        const userIds = Array.from(new Set(alertKeys.map(({ key }) => key.userId)));

        const staffMap = new Map<string, StaffEntryRow>();
        if (userIds.length > 0) {
            const { data: staffRows, error: staffError } = await supabaseAdmin
                .from("user_entry_united_view_single")
                .select("user_id, entry_date_original, entry_date_latest")
                .in("user_id", userIds);

            if (staffError) {
                throw new Error(
                    `staff entry date select failed: message=${staffError.message}, code=${staffError.code ?? ""}`
                );
            }

            for (const row of (staffRows ?? []) as StaffEntryRow[]) {
                const userId = String(row.user_id ?? "").trim();
                if (userId) staffMap.set(userId, row);
            }
        }

        let updatedCount = 0;
        let skippedCount = 0;

        for (const { row, key } of alertKeys) {
            const staff = staffMap.get(key.userId);
            if (!staff) {
                skippedCount++;
                continue;
            }

            const hasEntryDate = Boolean(
                String(staff.entry_date_latest || staff.entry_date_original || "").trim(),
            );
            const shouldResolve = hasEntryDate
                ? shouldResolveMonthlyMeetingAlert({
                    entryDateOriginal: staff.entry_date_original,
                    entryDateLatest: staff.entry_date_latest,
                    targetYm: key.targetYm,
                })
                : !(await hasStaffShiftInMonth(key.userId, key.targetYm));
            if (!shouldResolve) {
                skippedCount++;
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from("alert_log")
                .update({
                    status: "done",
                    status_source: "auto_done",
                    updated_at: nowIso,
                })
                .eq("id", row.id);

            if (updateError) {
                throw new Error(
                    `message=${updateError.message}, details=${updateError.details ?? ""}, hint=${updateError.hint ?? ""}, code=${updateError.code ?? ""}`
                );
            }

            updatedCount++;
        }

        console.info("[cron][alert-reset-monthly-meeting-unchecked] end", {
            openCount: openRows?.length ?? 0,
            updatedCount,
            skippedCount,
        });

        const result: Body = {
            ok: true,
            updatedCount,
            skippedCount,
        };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        console.error("[cron][alert-reset-monthly-meeting-unchecked] error", msg);

        const result: Body = {
            ok: false,
            error: msg,
        };

        return NextResponse.json(result, { status: 500 });
    }
}
