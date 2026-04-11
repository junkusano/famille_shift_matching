// src/types/plan.ts

export const PLAN_DOCUMENT_KINDS = [
  "障害福祉サービス",
  "移動支援サービス",
] as const;

export type PlanDocumentKind = (typeof PLAN_DOCUMENT_KINDS)[number];

export type PlanStatus = "draft" | "active" | "archived";

export interface AssessmentRecordRow {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_kind: string;
  assessed_on: string;
  author_user_id: string;
  author_name: string;
  content: Record<string, unknown>;
  is_deleted: boolean;
  meeting_minutes: string | null;
  meeting_minutes_updated_at: string | null;
  meeting_minutes_updated_by: string | null;
  meeting_minutes_meta: Record<string, unknown>;
}

export interface WeeklyTemplateSourceRow {
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
  plan_document_kind: string | null;
  plan_service_category: string | null;
  plan_display_name: string | null;
}

export interface MonthlySummaryItem {
  category: string;
  monthly_minutes: number;
  monthly_hours: number;
  occurrence_factor: number;
}

export interface PlanRowInsert {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  plan_document_kind: PlanDocumentKind;
  title: string;
  version_no: number;
  status: PlanStatus;
  issued_on: string | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  author_user_id: string | null;
  author_name: string | null;
  person_family_hope: string | null;
  assistance_goal: string | null;
  remarks: string | null;
  weekly_plan_comment: string | null;
  monthly_summary: MonthlySummaryItem[];
  content: Record<string, unknown>;
  generation_meta: Record<string, unknown>;
  is_deleted: boolean;
}

export interface PlanServiceRowInsert {
  plan_id: string;
  template_id: number | null;
  shift_service_code_id: string | null;
  service_code: string | null;
  plan_document_kind: PlanDocumentKind;
  plan_service_category: string | null;
  display_order: number;
  service_no: number;
  weekday: number | null;
  weekday_jp: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  is_biweekly: boolean;
  nth_weeks: number[] | null;
  monthly_occurrence_factor: number;
  monthly_minutes: number;
  monthly_hours: number;
  required_staff_count: number;
  two_person_work_flg: boolean;
  service_title: string | null;
  service_detail: string | null;
  procedure_notes: string | null;
  observation_points: string | null;
  family_action: string | null;
  schedule_note: string | null;
  source_snapshot: Record<string, unknown>;
  generation_meta: Record<string, unknown>;
  active: boolean;
}

export interface GeneratedPlanResult {
  plan_id: string;
  plan_document_kind: PlanDocumentKind;
  title: string;
  monthly_summary: MonthlySummaryItem[];
  service_count: number;
}