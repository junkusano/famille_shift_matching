import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const coreId = request.nextUrl.searchParams.get("core_id")?.trim();
    if (!coreId) return NextResponse.json({ error: "core_id is required" }, { status: 400 });
    const [{ data, error }, { data: env, error: envError }] = await Promise.all([
      supabaseAdmin.from("spot_offer_template_unified").select("*").eq("core_id", coreId).maybeSingle(),
      supabaseAdmin.from("env_variables").select("key_name,value").eq("group_key", "sukima"),
    ]);
    if (error || envError) throw error ?? envError;
    if (!data) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
    const values = Object.fromEntries((env ?? []).map((row) => [row.key_name, row.value ?? ""]));
    return NextResponse.json({ data: { ...data, env: {
      sukima_detail: String(values.sukima_detail ?? ""), sukima_automsg: String(values.sukima_automsg ?? ""),
      sukima_koudou: String(values.sukima_koudou ?? ""), sukima_caution: String(values.sukima_caution ?? ""),
    } } });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-data] failed", error);
    return NextResponse.json({ error: "Sharefullテンプレートデータの取得に失敗しました" }, { status: 500 });
  }
}
