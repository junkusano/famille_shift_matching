import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const userId = searchParams.get("user_id");
        const ym = searchParams.get("ym") ?? "2026-05";

        if (!userId) {
            return NextResponse.json(
                { ok: false, error: "user_id required" },
                { status: 400 }
            );
        }

        const targetMonth = `${ym}-01`;

        const { data, error } = await supabaseAdmin
            .from("staff_monthly_score_summaries")
            .select("*")
            .eq("user_id", userId)
            .eq("target_month", targetMonth)
            .maybeSingle();

        if (error) {
            console.error(error);

            return NextResponse.json(
                { ok: false, error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ok: true,
            score: data,
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