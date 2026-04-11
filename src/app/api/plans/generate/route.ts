// src/app/api/plans/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

type GenerateBody = {
  assessment_id?: string;
  replace_existing?: boolean;
};

type PlanDocumentKind =
  | "障害福祉サービス"
  | "移動支援サービス"
  | "訪問介護サービス"
  | "訪問介護予防サービス"
  | "役務提供請負サービス"
  | "重度障がい者等就労支援サービス";

type AssessmentRow = {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_kind: string;
  assessed_on: string;
  author_user_id: string;
  author_name: string;
  content: Record<string, unknown>;
  is_deleted: boolean;
};

type SourceRow = {
  template_id: number | null;
  kaipoke_cs_id: string | null;
  weekday: number | null;
  weekday_jp: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  service_code: string | null;
  required_staff_count: number | null;
  two_person_work_flg: boolean | null;
  active: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  is_biweekly: boolean | null;
  nth_weeks: number[] | null;
  invalid_time: boolean | null;
  overlaps_same_weekday: boolean | null;
  shift_service_code_id: string | null;
  kaipoke_servicek: string | null;
  kaipoke_servicecode: string | null;
  plan_document_kind: PlanDocumentKind | null;
  plan_service_category: string | null;
  plan_display_name: string | null;
};

const TITLE_MAP: Record<PlanDocumentKind, string> = {
  障害福祉サービス: "障害福祉サービス　ファミーユヘルパーサービス愛知　個別計画書",
  移動支援サービス: "移動支援サービス　ファミーユヘルパーサービス愛知　個別計画書",
  訪問介護サービス: "訪問介護サービス　ファミーユヘルパーサービス愛知　個別計画書",
  訪問介護予防サービス: "訪問介護予防サービス　ファミーユヘルパーサービス愛知　個別計画書",
  役務提供請負サービス: "役務提供請負サービス　ファミーユヘルパーサービス愛知　個別計画書",
  重度障がい者等就労支援サービス:
    "重度障がい者等就労支援サービス　ファミーユヘルパーサービス愛知　個別計画書",
};

function calcFactor(row: SourceRow) {
  if (row.is_biweekly) return 2.5;
  if (row.nth_weeks?.length) return row.nth_weeks.length;
  return 5;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function calcMonthlySummary(rows: SourceRow[]) {
  const map = new Map<
    string,
    { category: string; monthly_minutes: number; monthly_hours: number; occurrence_factor: number }
  >();

  for (const row of rows) {
    const category = row.plan_service_category ?? "未分類";
    const duration = row.duration_minutes ?? 0;
    const factor = calcFactor(row);
    const monthlyMinutes = duration * factor;

    const hit = map.get(category);
    if (hit) {
      hit.monthly_minutes += monthlyMinutes;
      hit.monthly_hours = round2(hit.monthly_minutes / 60);
      hit.occurrence_factor += factor;
    } else {
      map.set(category, {
        category,
        monthly_minutes: monthlyMinutes,
        monthly_hours: round2(monthlyMinutes / 60),
        occurrence_factor: factor,
      });
    }
  }

  return [...map.values()];
}

function extractAssessmentTexts(content: Record<string, unknown>) {
  const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
  const hopes: string[] = [];
  const remarks: string[] = [];

  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") continue;
    const rows = Array.isArray((sheet as { rows?: unknown }).rows)
      ? ((sheet as { rows?: unknown[] }).rows ?? [])
      : [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;

      const hope =
        typeof (row as { hope?: unknown }).hope === "string"
          ? ((row as { hope?: string }).hope ?? "").trim()
          : "";

      const remark =
        typeof (row as { remark?: unknown }).remark === "string"
          ? ((row as { remark?: string }).remark ?? "").trim()
          : "";

      if (hope) hopes.push(hope);
      if (remark) remarks.push(remark);
    }
  }

  return {
    person_family_hope: hopes.length ? [...new Set(hopes)].join(" / ") : null,
    assistance_goal: remarks.length ? [...new Set(remarks)].slice(0, 8).join(" / ") : null,
  };
}

function buildWarnings(rows: SourceRow[]) {
  const warnings: string[] = [];
  if (rows.some((r) => r.invalid_time)) warnings.push("時間不整合の可能性がある週間シフトを含みます。");
  if (rows.some((r) => r.overlaps_same_weekday)) warnings.push("同曜日重複の可能性がある週間シフトを含みます。");
  if (rows.some((r) => r.is_biweekly)) warnings.push("隔週シフトを含みます。月間総量は概算です。");
  if (rows.some((r) => (r.nth_weeks?.length ?? 0) > 0)) warnings.push("nth_weeks を含みます。帳票化前に確認してください。");
  if (rows.some((r) => r.two_person_work_flg)) warnings.push("2名同時作業を含みます。帳票明記を確認してください。");
  return warnings;
}

function buildScheduleNote(row: SourceRow) {
  const notes: string[] = [];
  if (row.is_biweekly) notes.push("隔週");
  if (row.nth_weeks?.length) notes.push(`第${row.nth_weeks.join("・")}週`);
  if (row.two_person_work_flg) notes.push("2名同時作業");
  return notes.length ? notes.join(" / ") : null;
}

export async function POST(req: NextRequest) {
  try {
    await getUserFromBearer(req);

    const body = (await req.json()) as GenerateBody;
    const assessmentId = String(body.assessment_id ?? "").trim();
    const replaceExisting = !!body.replace_existing;

    if (!assessmentId) {
      return json({ ok: false, error: "assessment_id is required" }, 400);
    }

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from("assessments_records")
      .select("*")
      .eq("assessment_id", assessmentId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (aErr) throw aErr;
    if (!assessment) return json({ ok: false, error: "assessment not found" }, 404);

    const a = assessment as AssessmentRow;

    const { data: sourceRows, error: sErr } = await supabaseAdmin
      .from("plan_generation_source_view")
      .select(`
        template_id,
        kaipoke_cs_id,
        weekday,
        weekday_jp,
        start_time,
        end_time,
        duration_minutes,
        service_code,
        required_staff_count,
        two_person_work_flg,
        active,
        effective_from,
        effective_to,
        is_biweekly,
        nth_weeks,
        invalid_time,
        overlaps_same_weekday,
        shift_service_code_id,
        kaipoke_servicek,
        kaipoke_servicecode,
        plan_document_kind,
        plan_service_category,
        plan_display_name
      `)
      .eq("kaipoke_cs_id", a.kaipoke_cs_id)
      .order("plan_document_kind", { ascending: true })
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (sErr) throw sErr;

    const rows = ((sourceRows ?? []) as SourceRow[]).filter(
      (r) =>
        r.plan_document_kind === "障害福祉サービス" ||
        r.plan_document_kind === "移動支援サービス"
    );

    if (rows.length === 0) {
      return json(
        {
          ok: false,
          error: "対象週間シフトがありません。障害福祉サービス / 移動支援サービス の週間シフトを確認してください。",
        },
        400
      );
    }

    const grouped = {
      障害福祉サービス: rows.filter((r) => r.plan_document_kind === "障害福祉サービス"),
      移動支援サービス: rows.filter((r) => r.plan_document_kind === "移動支援サービス"),
    };

    const targets = (Object.keys(grouped) as Array<"障害福祉サービス" | "移動支援サービス">).filter(
      (k) => grouped[k].length > 0
    );

    const extracted = extractAssessmentTexts(a.content ?? {});
    const results: unknown[] = [];

    for (const kind of targets) {
      const targetRows = grouped[kind];

      if (replaceExisting) {
        const { data: oldPlans, error: oldErr } = await supabaseAdmin
          .from("plans")
          .select("plan_id")
          .eq("assessment_id", a.assessment_id)
          .eq("plan_document_kind", kind)
          .eq("is_deleted", false);

        if (oldErr) throw oldErr;

        const oldIds = (oldPlans ?? []).map((x) => x.plan_id);
        if (oldIds.length > 0) {
          const { error: svcOffErr } = await supabaseAdmin
            .from("plan_services")
            .update({ active: false })
            .in("plan_id", oldIds);

          if (svcOffErr) throw svcOffErr;

          const { error: planOffErr } = await supabaseAdmin
            .from("plans")
            .update({ is_deleted: true, status: "archived" })
            .in("plan_id", oldIds);

          if (planOffErr) throw planOffErr;
        }
      }

      const { data: existing, error: eErr } = await supabaseAdmin
        .from("plans")
        .select("plan_id, title, monthly_summary")
        .eq("assessment_id", a.assessment_id)
        .eq("plan_document_kind", kind)
        .eq("is_deleted", false)
        .maybeSingle();

      if (eErr) throw eErr;

      if (existing && !replaceExisting) {
        results.push({
          plan_id: existing.plan_id,
          title: existing.title,
          plan_document_kind: kind,
          skipped: true,
        });
        continue;
      }

      const monthlySummary = calcMonthlySummary(targetRows);

      const { data: insertedPlan, error: pErr } = await supabaseAdmin
        .from("plans")
        .insert({
          assessment_id: a.assessment_id,
          client_info_id: a.client_info_id,
          kaipoke_cs_id: a.kaipoke_cs_id,
          plan_document_kind: kind,
          title: TITLE_MAP[kind],
          version_no: 1,
          status: "generated",
          issued_on: null,
          plan_start_date: null,
          plan_end_date: null,
          author_user_id: a.author_user_id,
          author_name: a.author_name,
          person_family_hope: extracted.person_family_hope,
          assistance_goal: extracted.assistance_goal,
          remarks: null,
          weekly_plan_comment: null,
          monthly_summary: monthlySummary,
          content: {
            assessment_content: a.content,
            source_count: targetRows.length,
          },
          generation_meta: {
            generated_at: new Date().toISOString(),
            source: "plan_generation_source_view",
            warnings: buildWarnings(targetRows),
          },
          is_deleted: false,
        })
        .select("plan_id, title, plan_document_kind, monthly_summary")
        .single();

      if (pErr) throw pErr;
      if (!insertedPlan) throw new Error("plan insert failed");

      const planServices = targetRows.map((row, index) => {
        const duration = row.duration_minutes ?? 0;
        const factor = calcFactor(row);
        const monthlyMinutes = Math.round(duration * factor);
        return {
          plan_id: insertedPlan.plan_id,
          template_id: row.template_id ?? null,
          shift_service_code_id: row.shift_service_code_id ?? null,
          service_code: row.service_code ?? null,
          plan_document_kind: kind,
          plan_service_category: row.plan_service_category ?? null,
          display_order: index + 1,
          service_no: index + 1,
          weekday: row.weekday ?? null,
          weekday_jp: row.weekday_jp ?? null,
          start_time: row.start_time ?? null,
          end_time: row.end_time ?? null,
          duration_minutes: duration,
          is_biweekly: !!row.is_biweekly,
          nth_weeks: row.nth_weeks ?? null,
          monthly_occurrence_factor: factor,
          monthly_minutes: monthlyMinutes,
          monthly_hours: round2(monthlyMinutes / 60),
          required_staff_count: row.required_staff_count ?? 1,
          two_person_work_flg: !!row.two_person_work_flg,
          service_title:
            row.plan_display_name ??
            row.plan_service_category ??
            row.service_code ??
            null,
          service_detail: null,
          procedure_notes: null,
          observation_points: null,
          family_action: null,
          schedule_note: buildScheduleNote(row),
          source_snapshot: {
            template_id: row.template_id,
            service_code: row.service_code,
            weekday: row.weekday,
            start_time: row.start_time,
            end_time: row.end_time,
            duration_minutes: row.duration_minutes,
            effective_from: row.effective_from,
            effective_to: row.effective_to,
          },
          generation_meta: {
            generated_at: new Date().toISOString(),
            invalid_time: row.invalid_time ?? false,
            overlaps_same_weekday: row.overlaps_same_weekday ?? false,
          },
          active: true,
        };
      });

      if (planServices.length > 0) {
        const { error: psErr } = await supabaseAdmin
          .from("plan_services")
          .insert(planServices);

        if (psErr) throw psErr;
      }

      results.push({
        plan_id: insertedPlan.plan_id,
        title: insertedPlan.title,
        plan_document_kind: kind,
        service_count: planServices.length,
        monthly_summary: monthlySummary,
      });
    }

    return json({
      ok: true,
      assessment_id: a.assessment_id,
      plans: results,
      warnings: buildWarnings(rows),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[plans/generate] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}