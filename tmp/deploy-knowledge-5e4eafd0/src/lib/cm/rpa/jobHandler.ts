// =============================================================
// src/lib/cm/rpa/jobHandler.ts
// RPA ジョブアイテム更新の共通処理
// =============================================================

import { supabaseAdmin } from '@/lib/supabase/service';
import type { CmJobParam, CmJobItemStatus } from '@/types/cm/jobs';

// =============================================================
// 型定義
// =============================================================

/**
 * _job パラメータ付きリクエストボディ
 */
export type RequestBodyWithJob<T = Record<string, unknown>> = T & {
  _job?: CmJobParam;
};

/**
 * ジョブアイテム更新結果
 */
export type JobItemUpdateResult = {
  /** 更新成功 */
  success: boolean;
  /** エラーメッセージ（失敗時） */
  error?: string;
};

// =============================================================
// ジョブアイテム更新関数
// =============================================================

/**
 * ジョブアイテムのステータスを更新
 *
 * @param jobParam - _job パラメータ
 * @param status - 新しいステータス
 * @param errorMessage - エラーメッセージ（failed時のみ）
 * @returns 更新結果
 */
export async function updateJobItemStatus(
  jobParam: CmJobParam | undefined,
  status: CmJobItemStatus,
  errorMessage?: string
): Promise<JobItemUpdateResult> {
  // _job パラメータがない場合はスキップ
  if (!jobParam?.job_id || !jobParam?.target_id) {
    return { success: true };
  }

  try {
    const updateData: Record<string, unknown> = {
      status,
      processed_at: new Date().toISOString(),
    };

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabaseAdmin
      .from('cm_job_items')
      .update(updateData)
      .eq('job_id', jobParam.job_id)
      .eq('target_id', jobParam.target_id);

    if (error) {
      console.error('[jobHandler] ジョブアイテム更新エラー:', error);
      return { success: false, error: error.message };
    }

    return { success: true };

  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[jobHandler] ジョブアイテム更新例外:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * ジョブアイテムを完了にする
 */
export async function markJobItemCompleted(
  jobParam: CmJobParam | undefined
): Promise<JobItemUpdateResult> {
  return updateJobItemStatus(jobParam, 'completed');
}

/**
 * ジョブアイテムを失敗にする
 */
export async function markJobItemFailed(
  jobParam: CmJobParam | undefined,
  errorMessage?: string
): Promise<JobItemUpdateResult> {
  return updateJobItemStatus(jobParam, 'failed', errorMessage);
}

/**
 * ジョブアイテムをスキップにする
 */
export async function markJobItemSkipped(
  jobParam: CmJobParam | undefined
): Promise<JobItemUpdateResult> {
  return updateJobItemStatus(jobParam, 'skipped');
}

// =============================================================
// リクエストボディ分離関数
// =============================================================

/**
 * リクエストボディから _job を分離
 *
 * @param body - リクエストボディ
 * @returns [データ部分, _jobパラメータ]
 */
export function extractJobParam<T extends Record<string, unknown>>(
  body: RequestBodyWithJob<T>
): [Omit<T, '_job'>, CmJobParam | undefined] {
  const { _job, ...data } = body;
  return [data as Omit<T, '_job'>, _job];
}

// =============================================================
// ラッパー関数（既存API改修用）
// =============================================================

/**
 * _job 付きリクエストを処理するラッパー関数
 *
 * @param body - リクエストボディ（_job含む）
 * @param processFunction - メインの処理関数
 * @returns 処理結果
 *
 * @example
 * ```ts
 * const result = await handleWithJob(body, async (data) => {
 *   // data には _job を除いたデータが渡される
 *   await saveToDatabase(data.records);
 *   return { success: data.records.length };
 * });
 * ```
 */
export async function handleWithJob<
  TBody extends Record<string, unknown>,
  TResult extends Record<string, unknown>
>(
  body: RequestBodyWithJob<TBody>,
  processFunction: (data: Omit<TBody, '_job'>) => Promise<TResult>
): Promise<{ result: TResult; jobItemUpdated: boolean }> {
  const [data, jobParam] = extractJobParam(body);

  try {
    // メイン処理実行
    const result = await processFunction(data);

    // 成功時：アイテムを完了にする
    if (jobParam) {
      await markJobItemCompleted(jobParam);
    }

    return { result, jobItemUpdated: !!jobParam };

  } catch (error) {
    // 失敗時：アイテムを失敗にする
    if (jobParam) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await markJobItemFailed(jobParam, errorMsg);
    }

    throw error;
  }
}