import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
    kaipoke_cs_id: string;
    shogai_jukyusha_no?: string | null;
    ido_jukyusyasho?: string | null;
};

export async function PUT(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

        if (!token) {
            return NextResponse.json({ error: "unauthorized:no_token" }, { status: 401 });
        }

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes?.user) {
            return NextResponse.json(
                { error: "unauthorized:bad_token", detail: userErr?.message ?? null },
                { status: 401 }
            );
        }

        const {
            kaipoke_cs_id,
            shogai_jukyusha_no = "",
            ido_jukyusyasho = "",
        } = (await req.json()) as Body;

        if (!kaipoke_cs_id) {
            return NextResponse.json({ error: "kaipoke_cs_id is required" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .update({
                shogai_jukyusha_no: shogai_jukyusha_no || null,
                ido_jukyusyasho: ido_jukyusyasho || null,
            })
            .eq("kaipoke_cs_id", kaipoke_cs_id)
            .select("kaipoke_cs_id, shogai_jukyusha_no, ido_jukyusyasho")
            .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
            ok: true,
            saved: data,
        });
    } catch (e) {
        console.error("[update-jukyusha-nos] error", e);
        return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
}