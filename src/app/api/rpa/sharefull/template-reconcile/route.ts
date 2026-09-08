import { NextRequest, NextResponse } from "next/server";
import { isSharefullSyncClient, sharefullSyncClientIds, sharefullSyncScopeLabel } from "@/lib/spot-sync/sharefullScope";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function todayInJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()).replaceAll("/", "-");
}

/**
 * Sharefullのテンプレート一覧を見て、手動削除済みのIDだけを再作成可能な状態へ戻す。
 * 実求人を掲載済みの案件は、テンプレートを消していても自動では変更しない。
 */
export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as { observed_template_ids?: unknown; list_complete?: unknown };
    if (body.list_complete !== true || !Array.isArray(body.observed_template_ids)) {
      return NextResponse.json({ error: "完全なテンプレート一覧が必要です" }, { status: 400 });
    }
    const observed = new Set(body.observed_template_ids
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => /^\d{4,}$/.test(id)));
    if (observed.size > 1000) return NextResponse.json({ error: "テンプレート数が多すぎます" }, { status: 400 });

    let templateQuery = supabaseAdmin
      .from("spot_offer_template_unified")
      .select("core_id, kaipoke_cs_id, sharefull_template_id")
      .not("sharefull_template_id", "is", null);
    const clientIds = sharefullSyncClientIds();
    if (clientIds !== null) templateQuery = templateQuery.in("kaipoke_cs_id", clientIds);
    const { data: templates, error: templateError } = await templateQuery;
    if (templateError) throw templateError;

    const missing = (templates ?? []).filter((template) => {
      const id = template.sharefull_template_id?.trim();
      return id && isSharefullSyncClient(template.kaipoke_cs_id) && !observed.has(id);
    });
    if (missing.length === 0) {
      return NextResponse.json({ ok: true, reset_count: 0, skipped_published_count: 0, scope: sharefullSyncScopeLabel() });
    }

    const coreIds = missing.map((template) => template.core_id);
    const { data: published, error: publishedError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .select("core_id")
      .in("core_id", coreIds)
      .not("sharefull_job_id", "is", null);
    if (publishedError) throw publishedError;
    const publishedCoreIds = new Set((published ?? []).map((row) => row.core_id));
    const resetCoreIds = coreIds.filter((coreId) => !publishedCoreIds.has(coreId));
    if (resetCoreIds.length > 0) {
      const updatedAt = new Date().toISOString();
      const { error: resetTemplateError } = await supabaseAdmin
        .from("spot_offer_template_unified")
        .update({ sharefull_template_id: null, sharefull_template_status: null, updated_at: updatedAt })
        .in("core_id", resetCoreIds);
      if (resetTemplateError) throw resetTemplateError;
      const { error: resetRequestError } = await supabaseAdmin
        .from("spot_offer_request_table")
        .update({ sharefull_status: null, updated_at: updatedAt })
        .in("core_id", resetCoreIds)
        .gte("shift_start_date", todayInJst())
        .is("sharefull_job_id", null);
      if (resetRequestError) throw resetRequestError;
    }
    return NextResponse.json({
      ok: true,
      reset_count: resetCoreIds.length,
      skipped_published_count: publishedCoreIds.size,
      scope: sharefullSyncScopeLabel(),
    });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-reconcile] failed", error);
    return NextResponse.json({ error: "削除済みテンプレートの再照合に失敗しました" }, { status: 500 });
  }
}
