// lib/alert/ensureSystemAlert.ts

import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";

export type VisibleRole = "admin" | "manager" | "staff";
export type AlertStatus = "open" | "in_progress" | "done" | "muted" | "cancelled";

export type EnsureAlertParams = {
  message: string;
  /** 初期Lv。指定なしなら 1 */
  severityBase?: number;
  visible_roles?: VisibleRole[];
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
};

export type EnsureResult = { created: boolean; id: string | null };

/**
 * created_at から経過日数を見て Lv を再計算する。
 *  - 登録日          … Lv1
 *  - 2日経過ごと     … Lv+1
 *  - 最大 Lv5
 */
function calcSeverity(createdAtIso: string, base = 1): number {
  const createdAt = new Date(createdAtIso);
  if (Number.isNaN(createdAt.getTime())) {
    // created_at が変なら、とりあえず base にフォールバック
    return Math.max(1, Math.min(5, base));
  }

  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const lvFromElapsed = 1 + Math.floor(diffDays / 2); // 2日ごとに +1
  const lv = Math.max(base, lvFromElapsed);

  return Math.max(1, Math.min(5, lv));
}

/**
 * システムアラートを「1つだけ」維持する関数。
 *
 * - 同じ message のアラートがあれば「その行を再利用」して更新
 * - なければ新規作成
 * - kaipoke_cs_id が 99999999 で始まるものは作成スキップ
 */
export async function ensureSystemAlert(params: EnsureAlertParams): Promise<EnsureResult> {
  const {
    message,
    severityBase = 1,
    visible_roles = ["admin", "manager", "staff"],
    kaipoke_cs_id = null,
    user_id = null,
    shift_id = null,
    rpa_request_id = null,
  } = params;

  // ④ テスト用CSはスキップ
  if (kaipoke_cs_id && kaipoke_cs_id.startsWith("99999999")) {
    console.log("[alert][ensure] skip test cs", kaipoke_cs_id, message);
    return { created: false, id: null };
  }

  // 同じ message のアラートを 1件だけ探す（status 問わず）
  const { data: existing, error: selectError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error("[alert][ensure] select error", { message, selectError });
    throw selectError;
  }

  // 1) 既存が無い → 新規作成
  if (!existing) {
    const initialSeverity = Math.max(1, Math.min(5, severityBase));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("alert_log")
      .insert({
        message,
        visible_roles,
        status: "open" as AlertStatus,
        status_source: "system",
        severity: initialSeverity,
        kaipoke_cs_id,
        user_id,
        shift_id,
        rpa_request_id,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      console.error("[alert][ensure] insert error", { message, insertError });
      throw insertError;
    }

    console.log("[alert][ensure] created new alert", {
      id: inserted?.id,
      message,
      severity: initialSeverity,
    });

    return { created: true, id: inserted?.id ?? null };
  }

  // 2) 既存がある → 再利用 & Lv/ステータスを更新
  type ExistingRow = {
    id: string;
    status: AlertStatus;
    created_at: string;
    visible_roles: string[] | null;
    kaipoke_cs_id: string | null;
    user_id: string | null;
    shift_id: string | null;
    rpa_request_id: string | null;
    severity: number;
  };

  const row = existing as ExistingRow;

  // ③ created_at から経過日数ベースで Lv 再計算
  const newSeverity = calcSeverity(row.created_at, severityBase);

  // ② 過去に done / cancelled にされていても、再発時は open に戻す
  const reopenedStatus: AlertStatus =
    row.status === "done" || row.status === "cancelled" ? "open" : row.status;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("alert_log")
    .update({
      status: reopenedStatus,
      status_source: "system",
      severity: newSeverity,
      // key情報は、既存が null / 空 の場合だけ新しい値で補完
      kaipoke_cs_id: row.kaipoke_cs_id ?? kaipoke_cs_id ?? null,
      user_id: row.user_id ?? user_id ?? null,
      shift_id: row.shift_id ?? shift_id ?? null,
      rpa_request_id: row.rpa_request_id ?? rpa_request_id ?? null,
      visible_roles: (row.visible_roles && row.visible_roles.length > 0
        ? row.visible_roles
        : visible_roles) as string[],
    })
    .eq("id", row.id)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error("[alert][ensure] update error", { message, updateError });
    throw updateError;
  }

  console.log("[alert][ensure] reused existing alert", {
    id: updated?.id ?? row.id,
    message,
    oldStatus: row.status,
    newStatus: reopenedStatus,
    newSeverity,
  });

  return { created: false, id: updated?.id ?? row.id ?? null };
}
