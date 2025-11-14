// types/alert_log.ts
export type AlertStatus = "open" | "in_progress" | "done" | "muted" | "cancelled";

export type AlertRow = {
  id: string;
  message: string;
  visible_roles: string[];
  status: AlertStatus;
  status_source: string;
  severity: number;
  result_comment: string | null;
  result_comment_by: string | null;
  result_comment_at: string | null;
  kaipoke_cs_id: string | null;
  user_id: string | null;
  shift_id: string | null;
  rpa_request_id: string | null;
  created_by: string | null;
  assigned_to: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

// 受信（POST）用
export type CreateInput = {
  message: string;
  severity: number;                   // 1..3
  visible_roles: string[];            // ["admin"|"manager"|"staff"] 想定
  status: AlertStatus;                // 既定 "open"
  status_source: string;              // 既定 "manual"
  kaipoke_cs_id: string | null;
  user_id: string | null;
  shift_id: string | null;
  rpa_request_id: string | null;
  created_by: string | null;          // auth_user_id から入れる場合あり
  assigned_to: string | null;
};

// 受信（PATCH）用（部分更新）
export type PatchInput = Partial<{
  status: AlertStatus;
  status_source: string;
  assigned_to: string | null;
  result_comment: string;
  auth_user_id: string | null;        // コメント者/完了者
}>;

// 判定ユーティリティ
export function isAlertRow(x: unknown): x is AlertRow {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.message === "string" &&
    Array.isArray(r.visible_roles) &&
    typeof r.status === "string" &&
    typeof r.status_source === "string" &&
    typeof r.severity === "number" &&
    typeof r.created_at === "string" &&
    typeof r.updated_at === "string"
  );
}

// Result ユニオン
export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

export const ok = <T,>(v: T): Ok<T> => ({ ok: true, value: v });
export const err = (e: string): Err => ({ ok: false, error: e });
export const isErr = <T,>(r: Result<T>): r is Err => r.ok === false;
