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
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("spot_offer_template_unified")
    .update({ sharefull_template_id: templateId, sharefull_template_status: "template_review", updated_at: updatedAt })
    .eq("core_id", coreId);
    if (error) throw error;

    // テンプレート作成直後はSharefull審査中のため、対象案件を保留状態にする。
    // 既存のタイミー募集状態や案件データは変更しない。
    const { error: statusError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .update({ sharefull_status: "template_review", updated_at: updatedAt })
      .eq("core_id", coreId)
      .gte("shift_start_date", updatedAt.slice(0, 10))
      .is("sharefull_status", null);

    if (statusError) throw statusError;

    return NextResponse.json({ ok: true, sharefull_status: "template_review" });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-id] failed", error);
    return NextResponse.json({ error: "Sharefull template IDの保存に失敗しました" }, { status: 500 });
  }
}
