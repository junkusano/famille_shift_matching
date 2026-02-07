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
        const client_id = (searchParams.get("client_id") ?? "").trim();
        const service_kind = (searchParams.get("service_kind") ?? "").trim() as AssessmentServiceKind;

        if (!client_id) return json({ ok: true, data: [] });

        const { data, error } = await supabaseAdmin
            .from("assessments_records")
            .select("*")
            .eq("client_id", client_id)
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
        const client_id = String(body.client_id ?? "").trim(); // == cs_kaipoke_info.kaipoke_cs_id
        const service_kind = String(body.service_kind ?? "").trim() as AssessmentServiceKind;
        const content = body.content ?? {};

        if (!client_id) throw new Error("client_id が空です");
        if (!service_kind) throw new Error("service_kind が空です");

        const { data, error } = await supabaseAdmin
            .from("assessments_records")
            .insert({
                client_id,
                service_kind,
                author_user_id,
                author_name, // 初期値はログインユーザー
                content,
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

