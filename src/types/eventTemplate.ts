// src/types/eventTemplate.ts
export type CheckSource =
  | "cs_docs"
  | "manual_admin"
  | "manual_manager"
  | "auto_generated";

export type DueRuleType =
  | "manual"
  | "fixed_date"
  | "shift_start"
  | "shift_end"
  | "shift_service_code_start";

export type EventTemplateRow = {
  id: string;
  template_name: string;
  overview: string | null;
  due_rule_type: DueRuleType;
  due_offset_days: number;
  due_rule_json: unknown; // jsonb
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EventTemplateRequiredDocRow = {
  id: string;
  template_id: string;
  doc_type_id: string;
  check_source: CheckSource;
  sort_order: number;
  memo: string | null;
  created_at: string;
  updated_at: string;

  // join 表示用（APIで付与）
  doc_category?: string;
  doc_label?: string;
};

export type EventTemplateWithDocs = EventTemplateRow & {
  required_docs: EventTemplateRequiredDocRow[];
};

export type UpsertEventTemplatePayload = {
  template_name: string;
  overview?: string | null;
  due_rule_type?: DueRuleType;
  due_offset_days?: number;
  due_rule_json?: unknown;
  is_active?: boolean;

  required_docs: Array<{
    doc_type_id: string;
    check_source: CheckSource;
    sort_order?: number;
    memo?: string | null;
  }>;
};
