// src/types/assessment.ts

export type AssessmentCheck = "NONE" | "CIRCLE";
export type AssessmentServiceKind = "障害" | "移動支援" | "要支援" | "要介護";

export type AssessmentRow = {
  key: string;
  label: string;
  check: AssessmentCheck;
  remark: string;
  hope: string;
};

export type AssessmentSheet = {
  key: string;
  title: string;
  printTarget: boolean;
  rows: AssessmentRow[];
};

export type AssessmentContent = {
  version: number;
  sheets: AssessmentSheet[];
};

export type AssessmentRecord = {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_kind: AssessmentServiceKind | string;
  assessed_on: string;
  author_user_id: string;
  author_name: string;
  content: AssessmentContent;
  is_deleted: boolean;
  created_at?: string;
  updated_at?: string;

  meeting_minutes?: string | null;
  meeting_minutes_updated_at?: string | null;
  meeting_minutes_updated_by?: string | null;
  meeting_minutes_meta?: Record<string, unknown>;
};