// src/app/api/assessment/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
    try {
        await getUserFromBearer(req);

        const { searchParams } = new URL(req.url);
        const q = (searchParams.get("q") ?? "").trim();

        let query = supabaseAdmin
            .from("cs_kaipoke_info")
            .select("kaipoke_cs_id, name, kana, service_kind")
            .eq("is_active", true)
            .order("kana", { ascending: true, nullsFirst: false })
            .order("name", { ascending: true });

        if (q) {
            // 名前 or カナで検索
            query = query.or(`name.ilike.%${q}%,kana.ilike.%${q}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        const mapped = (data ?? []).map((r) => ({
            client_id: r.kaipoke_cs_id,
            client_name: r.name,
            kana: r.kana ?? "",
            service_kind: r.service_kind ?? "",
        }));

        return json({ ok: true, data: mapped });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}

