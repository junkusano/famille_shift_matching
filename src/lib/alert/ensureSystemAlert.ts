// lib/alert/ensureSystemAlert.ts

import { supabaseAdmin } from "@/lib/supabase/service";

export type AlertStatus =
  | "open"
  | "in_progress"
  | "done"
  | "muted"
  | "cancelled";

export type EnsureAlertParams = {
  message: string;
  visible_roles?: string[];
  status?: AlertStatus; // 基本は "open" 固定でOK
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
 * システムアラートを「1メッセージにつき1つの open」に保ちながら Upsert する
 * - UNIQUE は (message, status)
 * - severity は created_at からの経過日数で自動計算（2日ごとに +1, 最大5）
 * - status_source は常に 'system'
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

  // 0. ダミーCS（99999999...）はそもそもアラート作らない
  if (kaipoke_cs_id && kaipoke_cs_id.startsWith("99999999")) {
    return { created: false, id: null, severity: 1 };
  }

  // ==========================
  // 1. まず「すでに open の行」が無いか見る
  // ==========================
  const { data: openExisting, error: openSelError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .eq("status", "open")
    .maybeSingle();

  if (openSelError) {
    console.error("[alert][ensure] select open error", openSelError, {
      message,
    });
    throw openSelError;
  }

  if (openExisting) {
    // 既存 open をベースに severity 自動レベルアップ
    const createdAt = new Date(openExisting.created_at);
    const diffDays = Math.floor(
      (now.getTime() - createdAt.getTime()) / 86400000
    );

    const autoLevel = 1 + Math.floor(diffDays / 2); // 2日で+1
    const severity = Math.min(
      Math.max(openExisting.severity ?? 1, autoLevel),
      5
    );

    const updatePayload = {
      severity,
      updated_at: nowIso,
      visible_roles,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
      status_source: openExisting.status_source ?? "system",
    };

    const { error: updError } = await supabaseAdmin
      .from("alert_log")
      .update(updatePayload)
      .eq("id", openExisting.id);

    if (updError) {
      console.error("[alert][ensure] update(open) error", updError, {
        id: openExisting.id,
        payload: updatePayload,
      });
      throw updError;
    }

    return {
      created: false,
      id: openExisting.id,
      severity,
    };
  }

  // ==========================
  // 2. open が無い → 同じ message の履歴があるか？
  // ==========================
  const { data: anyExisting, error: anySelError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anySelError) {
    console.error("[alert][ensure] select any error", anySelError, {
      message,
    });
    throw anySelError;
  }

  // 2-1. 完全に新しいメッセージ → 新規 insert
  if (!anyExisting) {
    const insertPayload = {
      message,
      visible_roles,
      status, // 基本 'open'
      status_source: "system",
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

  // 2-2. 過去レコードあり（現在は done/muted/cancelled 等） → 再オープン
  const createdAt = new Date(anyExisting.created_at);
  const diffDays = Math.floor(
    (now.getTime() - createdAt.getTime()) / 86400000
  );
  const autoLevel = 1 + Math.floor(diffDays / 2);
  const severity = Math.min(
    Math.max(anyExisting.severity ?? 1, autoLevel),
    5
  );

  const reopenPayload = {
    status: "open" as const,
    status_source: "system",
    severity,
    updated_at: nowIso,
    visible_roles,
    kaipoke_cs_id,
    user_id,
    shift_id,
    rpa_request_id,
  };

  const { error: reopenError } = await supabaseAdmin
    .from("alert_log")
    .update(reopenPayload)
    .eq("id", anyExisting.id);

  if (reopenError) {
    // ここで 23505 が出るのは、
    // 「どこか別で既に open レコードが新規作成されている」ケース
    if ((reopenError).code === "23505") {
      console.error(
        "[alert][ensure] reopen duplicate, fallback to open-only",
        reopenError,
        { message }
      );

      const { data: fallbackOpen } = await supabaseAdmin
        .from("alert_log")
        .select("*")
        .eq("message", message)
        .eq("status", "open")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallbackOpen) {
        return {
          created: false,
          id: fallbackOpen.id,
          severity: fallbackOpen.severity ?? severity,
        };
      }
    }

    console.error("[alert][ensure] update(reopen) error", reopenError, {
      id: anyExisting.id,
      payload: reopenPayload,
    });
    throw reopenError;
  }

  return {
    created: false,
    id: anyExisting.id,
    severity,
  };
}
