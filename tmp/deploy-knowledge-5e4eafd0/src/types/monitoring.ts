export const MONITORING_SERVICE_TYPES = ["care_insurance", "disability"] as const;
export type MonitoringServiceType = (typeof MONITORING_SERVICE_TYPES)[number];

export const MONITORING_STATUSES = [
  "draft",
  "ai_generated",
  "confirmed",
  "pdf_final",
  "fax_sent",
] as const;
export type MonitoringStatus = (typeof MONITORING_STATUSES)[number];

export const MONITORING_ACHIEVEMENTS = [
  "achieved",
  "partial",
  "not_achieved",
  "insufficient_evidence",
] as const;
export type MonitoringAchievement = (typeof MONITORING_ACHIEVEMENTS)[number];
export type MonitoringGoalType = "long_term" | "short_term" | "assistance";

export type MonitoringGoal = {
  id: string;
  monitoring_id: string;
  plan_goal_id: string | null;
  parent_plan_goal_id: string | null;
  goal_type: MonitoringGoalType;
  goal_text: string;
  evaluation_start: string | null;
  evaluation_end: string | null;
  achievement_status: MonitoringAchievement;
  evaluation_text: string;
  review_required: boolean;
  review_content: string;
  ai_evidence_json: string[];
  generated_by_ai: boolean;
  sort_order: number;
};

export type MonitoringRecord = {
  id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_type: MonitoringServiceType;
  period_start: string;
  period_end: string;
  evaluation_date: string;
  status: MonitoringStatus;
  assessment_id: string | null;
  plan_id: string | null;
  client_request: string;
  family_request: string;
  issues: string;
  summary: string;
  notable_observations: string[];
  monitoring_json: Record<string, unknown>;
  office_notice: string;
  generated_by_ai: boolean;
  ai_model: string | null;
  ai_generated_at: string | null;
  created_by: string;
  created_by_name: string | null;
  confirmed_by: string | null;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  current_pdf_snapshot_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MonitoringVisitRecord = {
  evidence_id: string;
  shift_id: number;
  record_id: string | null;
  date: string;
  start_time: string | null;
  service_code: string | null;
  status: string | null;
  note: string;
};

export type MonitoringSourceGoal = {
  goal_id: string;
  parent_goal_id: string | null;
  goal_type: MonitoringGoalType;
  goal_text: string;
  evaluation_start: string | null;
  evaluation_end: string | null;
};

export type MonitoringFaxTarget = {
  fax_id: string | null;
  office_name: string | null;
  contact_name: string | null;
  fax_number: string | null;
};

export type MonitoringContext = {
  client: Record<string, unknown>;
  service_type_detected: MonitoringServiceType | null;
  assessment: Record<string, unknown> | null;
  plan: Record<string, unknown> | null;
  goals: MonitoringSourceGoal[];
  visit_records: MonitoringVisitRecord[];
  previous_monitorings: Array<Record<string, unknown>>;
  fax_target: MonitoringFaxTarget;
  office_name: string | null;
  office_notice: string;
  warnings: string[];
  summary: {
    period_start: string;
    period_end: string;
    plan_period: string | null;
    visit_count: number;
    previous_monitoring_date: string | null;
    care_manager_name: string | null;
    fax_number: string | null;
  };
};

export type MonitoringDetailResponse = {
  monitoring: MonitoringRecord;
  goals: MonitoringGoal[];
  context: MonitoringContext;
  fax_history: Array<Record<string, unknown>>;
  pdf_snapshots: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  permissions: { can_manage: boolean };
};
