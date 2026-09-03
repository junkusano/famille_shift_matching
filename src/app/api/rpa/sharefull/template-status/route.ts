import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { enqueueSharefullPublicationJobsForTemplate } from "@/lib/spot-offer/enqueueSharefullPublicationJob";

const ALLOWED_STATUSES = new Set(["template_review", "ready_for_offer"]);

/**
 * シェアフルテンプレート単位の審査状態を更新する。
 * HTML/APIによる自動判定を追加する場合も、この状態更新を利用する。
 */
export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as { core_id?: unknown; sharefull_template_status?: unknown };
    const coreId = typeof body.core_id === "string" ? body.core_id.trim() : "";
    const status = typeof body.sharefull_template_status === "string"
      ? body.sharefull_template_status.trim()
      : "";
    if (!coreId || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "core_idまたは審査状態が不正です" }, { status: 400 });
    }

    const { data: template, error: lookupError } = await supabaseAdmin
      .from("spot_offer_template_unified")
      .select("core_id, sharefull_template_id")
      .eq("core_id", coreId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!template) return NextResponse.json({ error: "テンプレートが見つかりません" }, { status: 404 });

    const updatedAt = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("spot_offer_template_unified")
      .update({ sharefull_template_status: status, updated_at: updatedAt })
      .eq("core_id", coreId);
    if (updateError) throw updateError;

    // 既存の案件単位ステータスも互換のため同期する。
    const { error: requestUpdateError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .update({ sharefull_status: status, updated_at: updatedAt })
      .eq("core_id", coreId)
      .is("sharefull_job_id", null)
      .gte("shift_start_date", updatedAt.slice(0, 10));
    if (requestUpdateError) throw requestUpdateError;

    // 審査完了通知を受けた瞬間に、未来案件の掲載RPAジョブをRunnerへ渡す。
    // 自動掲載フラグが無効な環境ではヘルパーが何も登録しない。
    const dispatch = status === "ready_for_offer"
      ? await enqueueSharefullPublicationJobsForTemplate(coreId, "rpa.sharefull.template-status")
      : { registeredCount: 0 };

    return NextResponse.json({ ok: true, core_id: coreId, sharefull_template_status: status, publication_jobs_registered: dispatch.registeredCount });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-status] failed", error);
    return NextResponse.json({ error: "Sharefullテンプレート審査状態の更新に失敗しました" }, { status: 500 });
  }
}
