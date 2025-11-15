// lib/alert/ensureSystemAlert.ts

import { supabaseAdmin } from "@/lib/supabase/service";

export type EnsureAlertParams = {
  message: string;
  visible_roles?: string[];
  status?: "open" | "in_progress" | "done" | "muted" | "cancelled";
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
};

export type EnsureResult = {
  created: boolean;
  id: string | null;
  severity: number;
};

/**
 * アラート Upsert
 * ・message + status が唯一キー
 * ・severity は created_at からの経過日数（2日ごとに+1、Lv5上限）
 * ・status_source は必ず 'system' でセット
 */
export async function ensureSystemAlert(
  params: EnsureAlertParams
): Promise<EnsureResult> {
  const {
    message,
    visible_roles = ["manager"],
    status = "open",
    kaipoke_cs_id = null,
    user_id = null,
    shift_id = null,
    rpa_request_id = null,
  } = params;

  const now = new Date();
  const nowIso = now.toISOString();

  // 1. 既存レコード検索
  const { data: existing, error: selError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .eq("status", status)
    .maybeSingle();

  if (selError) {
    console.error("[alert][ensure] select error", selError, {
      message,
      status,
    });
    throw selError;
  }

  // ==========================
  // 2. 新規挿入（初回検出）
  // ==========================
  if (!existing) {
    const insertPayload = {
      message,
      visible_roles,
      status,
      status_source: "system",        // ★ ここを明示的にセット
      severity: 1,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: inserted, error: insError } = await supabaseAdmin
      .from("alert_log")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (insError) {
      console.error("[alert][ensure] insert error", insError, {
        payload: insertPayload,
      });
      throw insError;
    }

    return {
      created: true,
      id: inserted?.id ?? null,
      severity: 1,
    };
  }

  // ==========================
  // 3. 既存あり → severity 自動再計算
  // ==========================
  const createdAt = new Date(existing.created_at);
  const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);

  // 2日で +1Lv
  const autoLevel = 1 + Math.floor(diffDays / 2);
  const severity = Math.min(Math.max(existing.severity, autoLevel), 5);

  const updatePayload = {
    severity,
    updated_at: nowIso,
    visible_roles,
    kaipoke_cs_id,
    user_id,
    shift_id,
    rpa_request_id,
    status_source: existing.status_source ?? "system", // 念のため維持 or system
  };

  const { error: updError } = await supabaseAdmin
    .from("alert_log")
    .update(updatePayload)
    .eq("id", existing.id);

  if (updError) {
    console.error("[alert][ensure] update error", updError, {
      id: existing.id,
      payload: updatePayload,
    });
    throw updError;
  }

  return {
    created: false,
    id: existing.id,
    severity,
  };
}
