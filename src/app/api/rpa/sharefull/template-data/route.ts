import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { isSharefullSyncClient, sharefullTemplateTableName } from "@/lib/spot-sync/sharefullScope";
import { applySharefullContentPolicy } from "@/lib/spot-sync/sharefullContentPolicy";
import { recordSharefullContentPolicyBlock } from "@/lib/spot-sync/sharefullContentPolicyAlert";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const coreId = request.nextUrl.searchParams.get("core_id")?.trim();
    if (!coreId) return NextResponse.json({ error: "core_id is required" }, { status: 400 });
    const [{ data, error }, { data: env, error: envError }] = await Promise.all([
      supabaseAdmin.from(sharefullTemplateTableName() as never).select("*").eq("core_id", coreId).maybeSingle(),
      supabaseAdmin.from("env_variables").select("key_name,value").eq("group_key", "sukima"),
    ]);
    if (error || envError) throw error ?? envError;
    const template = data as Record<string, unknown> | null;
    if (!template || !isSharefullSyncClient(template.kaipoke_cs_id)) return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
    const values = Object.fromEntries((env ?? []).map((row) => [row.key_name, row.value ?? ""]));
    const rawData = { ...template, env: {
      sukima_detail: String(values.sukima_detail ?? ""), sukima_automsg: String(values.sukima_automsg ?? ""),
      sukima_koudou: String(values.sukima_koudou ?? ""), sukima_caution: String(values.sukima_caution ?? ""),
    } };
    // 自動作成・手動作成のどちらでも公開本文を同じルールで検査し、
    // タイミー関連表記はSharefull向けに変換し、要確認表現は記録して処理を続ける。
    const policy = applySharefullContentPolicy(rawData);
    const notification = policy.report.findings.length > 0
      ? await recordSharefullContentPolicyBlock({
          coreId,
          source: "rpa.sharefull.template-data",
          templateId: typeof template.sharefull_template_id === "string" ? template.sharefull_template_id : null,
          templateTitle: typeof template.template_title === "string" ? template.template_title : null,
          sourceData: rawData,
          report: policy.report,
        })
      : null;
    if (policy.report.status === "blocked") {
      return NextResponse.json({
        error: "公開本文の事前検査で停止しました",
        content_policy: policy.report,
        notification,
      }, { status: 422 });
    }
    return NextResponse.json({ data: policy.data, content_policy: policy.report, audit: notification });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/template-data] failed", error);
    return NextResponse.json({ error: "Sharefullテンプレートデータの取得に失敗しました" }, { status: 500 });
  }
}
