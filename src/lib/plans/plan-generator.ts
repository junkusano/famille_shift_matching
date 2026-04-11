// src/lib/plans/plan-generator.ts

import type {
  AssessmentRecordRow,
  MonthlySummaryItem,
  PlanDocumentKind,
  PlanRowInsert,
  PlanServiceRowInsert,
  WeeklyTemplateSourceRow,
} from "@/types/plan";

const PLAN_TITLE_MAP: Record<PlanDocumentKind, string> = {
  障害福祉サービス: "障害福祉サービス　ファミーユヘルパーサービス愛知　個別計画書",
  移動支援サービス: "移動支援サービス　ファミーユヘルパーサービス愛知　個別計画書",
};

export function isTargetPlanDocumentKind(
  value: string | null | undefined,
): value is PlanDocumentKind {
  return value === "障害福祉サービス" || value === "移動支援サービス";
}

export function calcDurationMinutes(row: WeeklyTemplateSourceRow): number {
  if (typeof row.duration_minutes === "number" && row.duration_minutes >= 0) {
    return row.duration_minutes;
  }

  if (!row.start_time || !row.end_time) return 0;

  const [sh, sm] = row.start_time.split(":").map(Number);
  const [eh, em] = row.end_time.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;

  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export function calcMonthlyOccurrenceFactor(row: WeeklyTemplateSourceRow): number {
  if (row.is_biweekly) return 2.5;

  if (row.nth_weeks && row.nth_weeks.length > 0) {
    return row.nth_weeks.length;
  }

  return 5;
}

export function buildMonthlySummary(rows: WeeklyTemplateSourceRow[]): MonthlySummaryItem[] {
  const map = new Map<string, MonthlySummaryItem>();

  for (const row of rows) {
    const category = row.plan_service_category ?? "未分類";
    const duration = calcDurationMinutes(row);
    const factor = calcMonthlyOccurrenceFactor(row);
    const monthlyMinutes = duration * factor;

    const existing = map.get(category);
    if (existing) {
      existing.monthly_minutes += monthlyMinutes;
      existing.monthly_hours = round2(existing.monthly_minutes / 60);
      existing.occurrence_factor += factor;
    } else {
      map.set(category, {
        category,
        monthly_minutes: monthlyMinutes,
        monthly_hours: round2(monthlyMinutes / 60),
        occurrence_factor: factor,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.category.localeCompare(b.category, "ja"));
}

export function buildPlanInsert(params: {
  assessment: AssessmentRecordRow;
  planDocumentKind: PlanDocumentKind;
  rows: WeeklyTemplateSourceRow[];
  actorUserId?: string | null;
  actorName?: string | null;
}): PlanRowInsert {
  const { assessment, planDocumentKind, rows, actorUserId, actorName } = params;

  const contentJson = assessment.content ?? {};
  const monthlySummary = buildMonthlySummary(rows);

  return {
    assessment_id: assessment.assessment_id,
    client_info_id: assessment.client_info_id,
    kaipoke_cs_id: assessment.kaipoke_cs_id,
    plan_document_kind: planDocumentKind,
    title: PLAN_TITLE_MAP[planDocumentKind],
    version_no: 1,
    status: "draft",
    issued_on: null,
    plan_start_date: null,
    plan_end_date: null,
    author_user_id: actorUserId ?? assessment.author_user_id ?? null,
    author_name: actorName ?? assessment.author_name ?? null,
    person_family_hope: getString(contentJson.person_family_hope),
    assistance_goal: getString(contentJson.assistance_goal),
    remarks: null,
    weekly_plan_comment: null,
    monthly_summary: monthlySummary,
    content: {
      source_assessment_content: contentJson,
      generated_from: "plan_generation_source_view",
      weekly_template_count: rows.length,
    },
    generation_meta: {
      generated_at: new Date().toISOString(),
      assessed_on: assessment.assessed_on,
      service_kind: assessment.service_kind,
      service_codes: [...new Set(rows.map((r) => r.service_code).filter(Boolean))],
    },
    is_deleted: false,
  };
}

export function buildPlanServiceInserts(
  planId: string,
  planDocumentKind: PlanDocumentKind,
  rows: WeeklyTemplateSourceRow[],
): PlanServiceRowInsert[] {
  return rows.map((row, index) => {
    const duration = calcDurationMinutes(row);
    const factor = calcMonthlyOccurrenceFactor(row);
    const monthlyMinutes = duration * factor;

    const notes: string[] = [];
    if (row.is_biweekly) notes.push("隔週");
    if (row.nth_weeks && row.nth_weeks.length > 0) {
      notes.push(`第${row.nth_weeks.join("・")}週`);
    }
    if (row.two_person_work_flg) {
      notes.push("2名同時作業");
    }

    return {
      plan_id: planId,
      template_id: row.template_id ?? null,
      shift_service_code_id: row.shift_service_code_id ?? null,
      service_code: row.service_code ?? null,
      plan_document_kind: planDocumentKind,
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
      schedule_note: notes.length > 0 ? notes.join(" / ") : null,
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
}

export function groupRowsByPlanDocumentKind(
  rows: WeeklyTemplateSourceRow[],
): Record<PlanDocumentKind, WeeklyTemplateSourceRow[]> {
  const grouped: Record<PlanDocumentKind, WeeklyTemplateSourceRow[]> = {
    障害福祉サービス: [],
    移動支援サービス: [],
  };

  for (const row of rows) {
    if (!isTargetPlanDocumentKind(row.plan_document_kind)) continue;
    grouped[row.plan_document_kind].push(row);
  }

  return grouped;
}

export function validateAssessmentForGeneration(assessment: AssessmentRecordRow) {
  if (!assessment.assessment_id) {
    throw new Error("assessment_id がありません");
  }
  if (!assessment.kaipoke_cs_id) {
    throw new Error("kaipoke_cs_id がありません");
  }
  if (assessment.is_deleted) {
    throw new Error("削除済み assessment は生成対象外です");
  }
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}