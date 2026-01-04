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
  status?: AlertStatus;
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
  // ✅ 追加：担当org（uuid文字列）
  assigned_org_id?: string | null;
};

export type EnsureResult = {
  created: boolean;
  id: string | null;
  severity: number;
};

// ✅ kaipoke_cs_id → assigned_org_id キャッシュ（同一実行内のDB負荷を減らす）
const assignedOrgCache = new Map<string, string | null>();

async function resolveAssignedOrgId(
  kaipoke_cs_id: string | null,
  provided: string | null | undefined
): Promise<string | null> {
  if (provided !== undefined) {
    return provided; // 呼び出し側が明示指定したならそれを優先
  }
  if (!kaipoke_cs_id) return null;

  if (assignedOrgCache.has(kaipoke_cs_id)) {
    return assignedOrgCache.get(kaipoke_cs_id) ?? null;
  }

  // cs_kaipoke_info から担当orgを取得
  const { data, error } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("asigned_org_id")
    .eq("kaipoke_cs_id", kaipoke_cs_id)
    .maybeSingle();

  if (error) {
    console.error("[alert][ensure] resolve asigned_org_id error", error, {
      kaipoke_cs_id,
    });
    // ここはアラート作成自体は止めない（nullで続行）
    assignedOrgCache.set(kaipoke_cs_id, null);
    return null;
  }

  const orgId = (data?.asigned_org_id ?? null) as string | null;
  assignedOrgCache.set(kaipoke_cs_id, orgId);
  return orgId;
}

/**
 * システムアラートを「1メッセージにつき1つの open」に保ちながら Upsert する
 * - UNIQUE は (message, status)
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
    assigned_org_id, // ✅ 追加
  } = params;

  const now = new Date();
  const nowIso = now.toISOString();

  // 0. ダミーCS（99999999...）はそもそもアラート作らない
  if (kaipoke_cs_id && kaipoke_cs_id.startsWith("99999999")) {
    return { created: false, id: null, severity: 1 };
  }

  // ✅ assigned_org_id を解決（未指定なら cs_kaipoke_info から引く）
  const resolvedAssignedOrgId = await resolveAssignedOrgId(
    kaipoke_cs_id,
    assigned_org_id
  );

  // 1) すでに open があるか？
  const { data: openExisting, error: openSelError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .eq("status", "open")
    .maybeSingle();

  if (openSelError) {
    console.error("[alert][ensure] select open error", openSelError, { message });
    throw openSelError;
  }

  if (openExisting) {
    const createdAt = new Date(openExisting.created_at);
    const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
    const autoLevel = 1 + Math.floor(diffDays / 2);
    const severity = Math.min(Math.max(openExisting.severity ?? 1, autoLevel), 5);

    const updatePayload = {
      severity,
      updated_at: nowIso,
      visible_roles,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
      assigned_org_id: resolvedAssignedOrgId, // ✅ 追加
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

    return { created: false, id: openExisting.id, severity };
  }

  // 2) open が無い → 同 message の履歴があるか？
  const { data: anyExisting, error: anySelError } = await supabaseAdmin
    .from("alert_log")
    .select("*")
    .eq("message", message)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anySelError) {
    console.error("[alert][ensure] select any error", anySelError, { message });
    throw anySelError;
  }

  // 2-1) 完全新規 → insert
  if (!anyExisting) {
    const insertPayload = {
      message,
      visible_roles,
      status,
      status_source: "system",
      severity: 1,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
      assigned_org_id: resolvedAssignedOrgId, // ✅ 追加
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data: inserted, error: insError } = await supabaseAdmin
      .from("alert_log")
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (insError) {
      console.error("[alert][ensure] insert error", insError, { payload: insertPayload });
      throw insError;
    }

    return { created: true, id: inserted?.id ?? null, severity: 1 };
  }

  // 2-2) 過去レコードあり → 再open
  const createdAt = new Date(anyExisting.created_at);
  const diffDays = Math.floor((now.getTime() - createdAt.getTime()) / 86400000);
  const autoLevel = 1 + Math.floor(diffDays / 2);
  const severity = Math.min(Math.max(anyExisting.severity ?? 1, autoLevel), 5);

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
    assigned_org_id: resolvedAssignedOrgId, // ✅ 追加
  };

  const { error: reopenError } = await supabaseAdmin
    .from("alert_log")
    .update(reopenPayload)
    .eq("id", anyExisting.id);

  if (reopenError) {
    if (reopenError.code === "23505") {
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

  return { created: false, id: anyExisting.id, severity };
}
