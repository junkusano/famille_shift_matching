import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

/**
 * Sharefull連携候補の読み取り専用一覧。
 *
 * 対象は、未来の勤務日でタイミー募集済み、かつSharefull未募集の案件です。
 * このAPIは検出のみを行い、既存テーブルへの登録・更新は行いません。
 * 既存のSharefullテンプレートがある案件だけを対象にします。
 * テンプレート審査中の案件は掲載候補から除外します。
 * テンプレート作成や、テンプレート未作成案件のジョブ登録はこのAPIでは行いません。
 */
export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const { data: requests, error: requestError } = await supabaseAdmin
      .from("spot_offer_request_table")
      .select(
        "id, core_id, shift_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, status, taimee_job_id, sharefull_job_id, sharefull_status"
      )
      .eq("status", "募集中")
      .not("taimee_job_id", "is", null)
      .gte("shift_start_date", today)
      .or("sharefull_status.is.null,sharefull_status.in.(template_review,ready_for_offer)")
      .order("shift_start_date", { ascending: true })
      .order("shift_start_time", { ascending: true });

    if (requestError) throw requestError;

    const rows = requests ?? [];
    const coreIds = Array.from(
      new Set(rows.map((row) => row.core_id).filter((coreId): coreId is string => Boolean(coreId)))
    );

    const { data: templates, error: templateError } = coreIds.length
      ? await supabaseAdmin
          .from("spot_offer_template_unified")
          .select("core_id, template_title, sharefull_template_id, sharefull_template_status, kaipoke_cs_id")
          .in("core_id", coreIds)
      : { data: [], error: null };

    if (templateError) throw templateError;

    const templateByCoreId = new Map(
      (templates ?? []).map((template) => [template.core_id, template])
    );

    const candidates = rows.flatMap((row) => {
      // 掲載済みの実案件IDがある場合は、状態値にかかわらず再掲載しない。
      if (row.sharefull_job_id?.trim()) return [];

      const template = row.core_id ? templateByCoreId.get(row.core_id) : undefined;
      const sharefullTemplateId = template?.sharefull_template_id?.trim() ?? "";

      // 今回は既存テンプレートからの案件掲載だけを対象にする。
      if (!sharefullTemplateId) return [];
      if (template?.sharefull_template_status === "template_review") return [];

      return [{
        ...row,
        sharefull_template_id: sharefullTemplateId,
        sharefull_template_status: template?.sharefull_template_status ?? null,
        template_title: template?.template_title ?? null,
        kaipoke_cs_id: template?.kaipoke_cs_id ?? null,
        next_action: row.sharefull_status === "template_review"
          ? "create_spot_offer"
          : row.sharefull_status === "ready_for_offer"
            ? "create_spot_offer"
            : "none",
      }];
    });

    return NextResponse.json({
      ok: true,
      read_only: true,
      target_date_from: today,
      review_wait_hours: 2,
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    if (isRpaTaimeeError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("[rpa/sharefull/candidates] failed", error);
    return NextResponse.json(
      { error: "Sharefull連携候補の取得に失敗しました" },
      { status: 500 }
    );
  }
}
