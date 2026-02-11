//api/assessment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import type { AssessmentServiceKind } from "@/types/assessment";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
}

async function getAuthor(req: NextRequest) {
    const { user } = await getUserFromBearer(req); // Supabase Auth の user
    const authUid = user?.id;
    if (!authUid) throw new Error("unauthorized");

    // public.users から user_id を引く
    const { data: u, error: uErr } = await supabaseAdmin
        .from("users")
        .select("user_id")
        .eq("auth_user_id", authUid)
        .maybeSingle();

    if (uErr) throw uErr;
    const userId = u?.user_id;
    if (!userId) throw new Error("users に auth_user_id の紐づきがありません");

    // users_lw_temp から氏名
    const { data: lw } = await supabaseAdmin
        .from("users_lw_temp")
        .select("full_name, nickname")
        .eq("user_id", userId)
        .maybeSingle();

    const authorName = (lw?.full_name ?? lw?.nickname ?? userId).trim();

    return { author_user_id: userId, author_name: authorName };
}

export async function GET(req: NextRequest) {
    try {
        await getUserFromBearer(req);

        const { searchParams } = new URL(req.url);
        const clientInfoId = String(searchParams.get("client_info_id") ?? "").trim();
        const service_kind = (searchParams.get("service_kind") ?? "").trim() as AssessmentServiceKind;

        if (!clientInfoId) return json({ ok: true, data: [] });

        const { data, error } = await supabaseAdmin
            .from("assessments_records")
            .select("*")
            .eq("client_info_id", clientInfoId)
            .eq("service_kind", service_kind)
            .eq("is_deleted", false)
            .order("assessed_on", { ascending: false });

        if (error) throw error;
        return json({ ok: true, data: data ?? [] });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const { author_user_id, author_name } = await getAuthor(req);

        const body = await req.json();
        const kaipoke_cs_id = String(body.client_id ?? "").trim(); // フロントは client_id に kaipoke_cs_id を入れて送ってくる前提
        const service_kind = String(body.service_kind ?? "").trim();
        const content = body.content ?? {};

        if (!kaipoke_cs_id) return json({ ok: false, error: "client_id is required" }, 400);
        if (!service_kind) return json({ ok: false, error: "service_kind is required" }, 400);

        // cs_kaipoke_info から client_info_id を特定
        const { data: cli, error: cliErr } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select("id, kaipoke_cs_id")
            .eq("kaipoke_cs_id", kaipoke_cs_id)
            .maybeSingle();

        if (cliErr) throw cliErr;
        if (!cli?.id) return json({ ok: false, error: "client not found" }, 404);

        const { data, error } = await supabaseAdmin
            .from("assessments_records")
            .insert({
                client_info_id: cli.id,
                kaipoke_cs_id: cli.kaipoke_cs_id,
                service_kind,
                content,
                author_user_id,
                author_name,
            })
            .select("*")
            .single();

        if (error) throw error;
        return json({ ok: true, data });

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}

