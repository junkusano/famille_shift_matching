import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
    ok: boolean;
    updatedCount?: number;
    error?: string;
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

        let updatedCount = 0;

        for (const row of openRows ?? []) {
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
        });

        const result: Body = {
            ok: true,
            updatedCount,
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