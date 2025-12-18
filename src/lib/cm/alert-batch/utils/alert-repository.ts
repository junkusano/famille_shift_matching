// src/lib/cm/alert-batch/utils/alert-repository.ts
// アラートDB操作リポジトリ
//
// テーブル構造:
//   cm_kaipoke_info (利用者)
//     └── cm_kaipoke_insurance (被保険者証)
//           └── cm_kaipoke_support_office (支援事業所・担当ケアマネ)
//
// 担当ケアマネの紐付け:
//   cm_kaipoke_support_office.care_manager_kaipoke_id → users.kaipoke_user_id

import { supabaseAdmin } from "@/lib/supabase/service";
import type {
  CmBatchRunOptions,
  CmBatchRunRecord,
  CmBatchStats,
  CmUpsertAlertInput,
  CmUpsertResult,
  CmExistingAlertRecord,
  CmClientWithInsurance,
  CmUserRecord,
  CmAlertCategory,
  CmInsuranceWithSupport,
} from "@/types/cm/alert-batch";

// =============================================================
// バッチ実行レコード操作
// =============================================================

/**
 * バッチ実行レコードを作成
 */
export async function cmCreateBatchRun(
  options: CmBatchRunOptions
): Promise<CmBatchRunRecord> {
  const { data, error } = await supabaseAdmin
    .from("cm_alert_batch_runs")
    .insert({
      run_type: options.runType,
      triggered_by: options.triggeredBy ?? null,
      status: "running",
      started_at: new Date().toISOString(),
      stats: {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`バッチ実行レコード作成失敗: ${error.message}`);
  }

  return data as CmBatchRunRecord;
}

/**
 * バッチ実行レコードを完了に更新
 */
export async function cmCompleteBatchRun(
  batchRunId: string,
  stats: CmBatchStats
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cm_alert_batch_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      stats,
    })
    .eq("id", batchRunId);

  if (error) {
    throw new Error(`バッチ完了更新失敗: ${error.message}`);
  }
}

/**
 * バッチ実行レコードを失敗に更新
 */
export async function cmFailBatchRun(
  batchRunId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("cm_alert_batch_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq("id", batchRunId);

  if (error) {
    console.error(`バッチ失敗更新エラー: ${error.message}`);
  }
}

// =============================================================
// アラート操作
// =============================================================

/**
 * アラートを作成または更新（UPSERT）
 */
export async function cmUpsertAlert(
  input: CmUpsertAlertInput
): Promise<CmUpsertResult> {
  const referenceId = (input.details as { reference_id: string }).reference_id;

  const { data: existing, error: selectError } = await supabaseAdmin
    .from("cm_alerts")
    .select("id, alert_type, severity, details, status")
    .eq("kaipoke_cs_id", input.kaipoke_cs_id)
    .eq("category", input.category)
    .neq("status", "resolved")
    .returns<CmExistingAlertRecord[]>();

  if (selectError) {
    throw new Error(`既存アラート検索失敗: ${selectError.message}`);
  }

  const matchingAlert = existing?.find(
    (alert) => alert.details?.reference_id === referenceId
  );

  if (matchingAlert) {
    const needsUpdate =
      matchingAlert.alert_type !== input.alert_type ||
      matchingAlert.severity !== input.severity ||
      JSON.stringify(matchingAlert.details) !== JSON.stringify(input.details);

    if (needsUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from("cm_alerts")
        .update({
          alert_type: input.alert_type,
          severity: input.severity,
          details: input.details,
          updated_at: new Date().toISOString(),
          batch_run_id: input.batch_run_id,
        })
        .eq("id", matchingAlert.id);

      if (updateError) {
        throw new Error(`アラート更新失敗: ${updateError.message}`);
      }

      return { created: false, updated: true, alertId: matchingAlert.id };
    }

    return { created: false, updated: false, alertId: matchingAlert.id };
  }

  const { data: newAlert, error: insertError } = await supabaseAdmin
    .from("cm_alerts")
    .insert({
      kaipoke_cs_id: input.kaipoke_cs_id,
      client_name: input.client_name,
      category: input.category,
      alert_type: input.alert_type,
      severity: input.severity,
      details: input.details,
      status: "unread",
      batch_run_id: input.batch_run_id,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(`アラート作成失敗: ${insertError.message}`);
  }

  return { created: true, updated: false, alertId: newAlert.id };
}

/**
 * 特定のアラートを解消（RPC関数使用）
 */
export async function cmResolveAlert(
  kaipoke_cs_id: string,
  category: CmAlertCategory,
  referenceId: string,
  resolutionNote: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("cm_resolve_alert_by_reference", {
    p_kaipoke_cs_id: kaipoke_cs_id,
    p_category: category,
    p_reference_id: referenceId,
    p_resolution_note: resolutionNote,
  });

  if (error) {
    throw new Error(`アラート解消失敗: ${error.message}`);
  }

  return data !== null;
}

/**
 * 利用終了者のアラートを一括解消（RPC関数使用）
 */
export async function cmResolveAlertsByClientTermination(
  category: CmAlertCategory
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("cm_resolve_alerts_by_termination", {
    p_category: category,
    p_resolution_note: "利用者が利用終了",
  });

  if (error) {
    throw new Error(`利用終了者アラート解消失敗: ${error.message}`);
  }

  return data ?? 0;
}

// =============================================================
// データ取得
// =============================================================

/**
 * 利用中の利用者と被保険者証情報を取得
 * 
 * テーブル構造:
 *   cm_kaipoke_info (利用者)
 *     └── cm_kaipoke_insurance (被保険者証)
 *           └── cm_kaipoke_support_office (支援事業所・担当ケアマネ)
 */
export async function cmFetchActiveClientsWithInsurance(): Promise<CmClientWithInsurance[]> {
  // 1. 利用中の利用者を取得
  const { data: clients, error: clientError } = await supabaseAdmin
    .from("cm_kaipoke_info")
    .select("kaipoke_cs_id, name, client_status")
    .eq("client_status", "利用中");

  if (clientError) {
    throw new Error(`利用者取得失敗: ${clientError.message}`);
  }

  if (!clients || clients.length === 0) {
    return [];
  }

  const clientIds = clients.map((c) => c.kaipoke_cs_id);

  // 2. 被保険者証情報を取得
  const { data: insurances, error: insuranceError } = await supabaseAdmin
    .from("cm_kaipoke_insurance")
    .select("kaipoke_insurance_id, kaipoke_cs_id, coverage_start, coverage_end, care_level")
    .in("kaipoke_cs_id", clientIds);

  if (insuranceError) {
    throw new Error(`被保険者証取得失敗: ${insuranceError.message}`);
  }

  // 3. 支援事業所情報を取得（担当ケアマネ）
  const { data: supportOffices, error: supportError } = await supabaseAdmin
    .from("cm_kaipoke_support_office")
    .select("kaipoke_cs_id, kaipoke_insurance_id, apply_start, care_manager_kaipoke_id, care_manager_name")
    .in("kaipoke_cs_id", clientIds);

  if (supportError) {
    throw new Error(`支援事業所取得失敗: ${supportError.message}`);
  }

  // 4. 支援事業所を被保険者証ごとにマッピング
  //    同一被保険者証に複数レコードがある場合は apply_start が最新のものを使用
  const supportMap = new Map<string, typeof supportOffices[0]>();
  for (const support of supportOffices ?? []) {
    const key = `${support.kaipoke_cs_id}:${support.kaipoke_insurance_id}`;
    const existing = supportMap.get(key);
    if (!existing || support.apply_start > existing.apply_start) {
      supportMap.set(key, support);
    }
  }

  // 5. 被保険者証に支援事業所情報を付与
  const insurancesWithSupport: CmInsuranceWithSupport[] = (insurances ?? []).map((ins) => {
    const key = `${ins.kaipoke_cs_id}:${ins.kaipoke_insurance_id}`;
    const support = supportMap.get(key);
    return {
      ...ins,
      support_office: support
        ? {
            care_manager_kaipoke_id: support.care_manager_kaipoke_id,
            care_manager_name: support.care_manager_name,
            apply_start: support.apply_start,
          }
        : null,
    };
  });

  // 6. 利用者ごとに被保険者証をグループ化
  const insuranceMap = new Map<string, CmInsuranceWithSupport[]>();
  for (const ins of insurancesWithSupport) {
    const existing = insuranceMap.get(ins.kaipoke_cs_id) ?? [];
    existing.push(ins);
    insuranceMap.set(ins.kaipoke_cs_id, existing);
  }

  return clients.map((client) => ({
    kaipoke_cs_id: client.kaipoke_cs_id,
    name: client.name,
    status: client.client_status,
    insurances: insuranceMap.get(client.kaipoke_cs_id) ?? [],
  }));
}

/**
 * ユーザーマスタを取得（kaipoke_user_id をキーとしたMap）
 * 
 * 用途: 担当ケアマネが退職済みかどうかの判定
 * 紐付け: cm_kaipoke_support_office.care_manager_kaipoke_id → users.kaipoke_user_id
 * 
 * ※名前は cm_kaipoke_support_office.care_manager_name を使うため取得不要
 */
export async function cmFetchUsersMap(): Promise<Map<string, CmUserRecord>> {
  const { data: users, error } = await supabaseAdmin
    .from("users")
    .select("kaipoke_user_id, status")
    .not("kaipoke_user_id", "is", null);

  if (error) {
    throw new Error(`ユーザー取得失敗: ${error.message}`);
  }

  const map = new Map<string, CmUserRecord>();
  for (const user of users ?? []) {
    if (user.kaipoke_user_id) {
      map.set(user.kaipoke_user_id, {
        kaipoke_user_id: user.kaipoke_user_id,
        status: user.status ?? "",
      });
    }
  }

  return map;
}

/**
 * 特定カテゴリの未解決アラートを取得
 */
export async function cmFetchUnresolvedAlerts(
  category: CmAlertCategory
): Promise<CmExistingAlertRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("cm_alerts")
    .select("id, alert_type, severity, details, status")
    .eq("category", category)
    .neq("status", "resolved");

  if (error) {
    throw new Error(`未解決アラート取得失敗: ${error.message}`);
  }

  return (data ?? []) as CmExistingAlertRecord[];
}