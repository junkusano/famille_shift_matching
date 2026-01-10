// src/types/eventTasks.ts
export type EventTaskStatus = "open" | "in_progress" | "done" | "cancelled" | "muted";
export type RequiredDocStatus = "pending" | "ok" | "ng" | "skipped";

export type EventTemplateRow = {
  id: string;
  template_name: string;
  overview: string | null;
  due_rule_type: string;
  due_offset_days: number;
  due_rule_json: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EventTaskRow = {
  id: string;
  template_id: string;
  kaipoke_cs_id: string;
  user_id: string | null;
  orgunitid: string | null;
  due_date: string; // YYYY-MM-DD
  memo: string | null;
  status: EventTaskStatus;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type EventTaskRequiredDocRow = {
  id: string;
  event_task_id: string;
  doc_type_id: string;
  memo: string | null;
  result_doc_id: string | null;
  status: RequiredDocStatus;
  checked_at: string | null;
  checked_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

// 表示用：名前などを付加（join/マップ結果を混ぜる用の型）
export type EventTaskRequiredDocView = EventTaskRequiredDocRow & {
  doc_type_name: string | null;
};

export type EventTaskView = EventTaskRow & {
  template_name: string | null;
  client_name: string | null;
  assigned_user_name: string | null;
  required_docs: EventTaskRequiredDocView[];
};

export type UpsertEventTaskPayload = {
  // create の時は template_id/kaipoke_cs_id/due_date 必須
  template_id: string;
  kaipoke_cs_id: string;
  due_date: string; // YYYY-MM-DD
  user_id?: string | null;
  orgunitid?: string | null;
  memo?: string | null;
  status?: EventTaskStatus;

  // required docs: create は未指定ならテンプレからコピー
  required_docs?: Array<{
    doc_type_id: string;
    memo?: string | null;
    status?: RequiredDocStatus;
    result_doc_id?: string | null;
  }>;
};

export type UpdateEventTaskPayload = Partial<Omit<UpsertEventTaskPayload, "template_id" | "kaipoke_cs_id">> & {
  // 更新時に required_docs を全入替したい場合だけ渡す
  required_docs?: UpsertEventTaskPayload["required_docs"];
};

export type EventTaskMetaResponse = {
  admin: boolean;
  templates: Array<Pick<EventTemplateRow, "id" | "template_name" | "overview" | "due_rule_type" | "due_offset_days" | "is_active">>;
  clients: Array<{ kaipoke_cs_id: string; client_name: string }>;
  users: Array<{ user_id: string; name: string }>;
};
