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

  // 1. 既存レコード検索
  const { data: existing } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .eq("status", status)
    .maybeSingle();

  // ==========================
  // 2. 新規挿入（初回検出）
  // ==========================
  if (!existing) {
    const { data: inserted } = await supabaseAdmin
      .from("alert_log")
      .insert({
        message,
        visible_roles,
        status,
        severity: 1,
        kaipoke_cs_id,
        user_id,
        shift_id,
        rpa_request_id,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select()
      .maybeSingle();

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

  // UPDATE
  await supabaseAdmin
    .from("alert_log")
    .update({
      severity,
      updated_at: now.toISOString(),
      visible_roles,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
    })
    .eq("id", existing.id);

  return {
    created: false,
    id: existing.id,
    severity,
  };
}
