// =============================================================
// src/lib/cm/rpa/cmRpaJobValidation.ts
// RPA ジョブ マスタ検証ユーティリティ
//
// jobs/route.ts と jobs/next/route.ts で重複していた
// isValidQueue / isValidJobType を統合
// =============================================================

import { supabaseAdmin } from "@/lib/supabase/service";

/**
 * キューコードの存在確認
 * cm_job_queues テーブルで is_active = true のレコードを検索
 */
export async function cmIsValidQueue(queueCode: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("cm_job_queues")
    .select("id")
    .eq("code", queueCode)
    .eq("is_active", true)
    .limit(1)
    .single();

  return !error && !!data;
}

/**
 * ジョブタイプコードの存在確認
 * cm_job_types テーブルで queue_code + code + is_active = true を検索
 */
export async function cmIsValidJobType(
  queueCode: string,
  jobTypeCode: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("cm_job_types")
    .select("id")
    .eq("queue_code", queueCode)
    .eq("code", jobTypeCode)
    .eq("is_active", true)
    .limit(1)
    .single();

  return !error && !!data;
}
