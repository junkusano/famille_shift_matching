import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { isSharefullSyncClient, sharefullRequestTableName, sharefullTemplateTableName } from "@/lib/spot-sync/sharefullScope";
import { buildJmtyCandidates, type JmtyRequest, type JmtyTemplate } from "@/lib/spot-offer/jmtyCandidates";

export const dynamic = "force-dynamic";

function todayInJapan(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

/** Read-only Jimoty candidate list. It never creates RPA jobs or changes listing state. */
export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const today = todayInJapan();
    const { data: sourceRequests, error: requestError } = await supabaseAdmin
      .from(sharefullRequestTableName() as never)
      .select("id, core_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, unit_amount, commute_fee, jmty_status, sharefull_job_id")
      .eq("status", "募集中")
      .gte("shift_start_date", today)
      .or("jmty_status.is.null,jmty_status.eq.template_review,jmty_status.eq.ready_for_offer")
      .order("shift_start_date", { ascending: true })
      .order("shift_start_time", { ascending: true });
    if (requestError) throw requestError;

    const requests = ((sourceRequests ?? []) as unknown as Array<JmtyRequest & { kaipoke_cs_id: string | null }>)
      .filter((row) => isSharefullSyncClient(row.kaipoke_cs_id));
    const coreIds = [...new Set(requests.map((row) => row.core_id).filter((id): id is string => Boolean(id)))];
    const { data: sourceTemplates, error: templateError } = coreIds.length
      ? await supabaseAdmin.from(sharefullTemplateTableName() as never)
          .select("core_id, jmty_template_status, template_title, work_description, matching_place_name, kaipoke_cs_id")
          .in("core_id", coreIds)
      : { data: [], error: null };
    if (templateError) throw templateError;

    const templates = ((sourceTemplates ?? []) as unknown as Array<JmtyTemplate & { kaipoke_cs_id: string | null }>)
      .filter((row) => isSharefullSyncClient(row.kaipoke_cs_id));
    const candidates = buildJmtyCandidates(requests, templates, today);
    return NextResponse.json({ ok: true, read_only: true, target_date_from: today, count: candidates.length, candidates });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/jmty/candidates] failed");
    return NextResponse.json({ error: "ジモティー掲載候補の取得に失敗しました" }, { status: 500 });
  }
}
