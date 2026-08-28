import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as { core_id?: unknown; sharefull_template_id?: unknown };
    const coreId = typeof body.core_id === "string" ? body.core_id.trim() : "";
    const templateId = typeof body.sharefull_template_id === "string" ? body.sharefull_template_id.trim() : "";
    if (!coreId || !templateId || templateId === "428828") return NextResponse.json({ error: "IDが不正です" }, { status: 400 });
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("spot_offer_template_unified").select("core_id").eq("core_id", coreId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  const { error } = await supabaseAdmin.from("spot_offer_template_unified")
    .update({ sharefull_template_id: templateId })
    .eq("core_id", coreId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-id] failed", error);
    return NextResponse.json({ error: "Sharefull template IDの保存に失敗しました" }, { status: 500 });
  }
}
