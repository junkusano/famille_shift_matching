//api/assessment/clients/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  try {
    await getUserFromBearer(req); // 認証（必要なら）

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabaseAdmin
      .from("cs_kaipoke_info")
      .select("kaipoke_cs_id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(50);

    if (q) {
      // name 部分一致（必要なら kana 等も追加）
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []).map((r) => ({
      client_id: r.kaipoke_cs_id,
      client_name: r.name,
    }));

    return json({ ok: true, data: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: msg }, 500);
  }
}
