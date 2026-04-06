export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        const nowIso = new Date().toISOString();

        const { data: openRows } = await supabaseAdmin
            .from("alert_log")
            .select("id, message")
            .eq("status", "open")
            .in("status_source", ["system"])
            .like("message", "%disability_check:collect:%");

        let updatedCount = 0;
        for (const row of openRows ?? []) {
            const { error } = await supabaseAdmin
                .from("alert_log")
                .update({
                    status: "done",
                    status_source: "auto_done",
                    updated_at: nowIso,
                })
                .eq("id", row.id);

            if (!error) updatedCount++;
        }

        return NextResponse.json({ ok: true, updatedCount });
    } catch (e) {
        console.error("[cron][alert-reset-disability-check-collected] error", e);
        return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
    }
}