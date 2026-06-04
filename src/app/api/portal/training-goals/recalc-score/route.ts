// api/portal/training-goals/recalc-score/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const entryId = body.entry_id;

        if (!entryId) {
            return NextResponse.json(
                { error: "entry_id required" },
                { status: 400 }
            );
        }

        return NextResponse.json({
            ok: true,
            message: "score recalculation is handled by cron",
            entry_id: entryId,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "failed";

        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}