// =============================================================
// src/lib/plaud_support_progress_summary/plaud_support_progress_summary.ts
// Plaud支援経過要約生成 + RPAリクエスト作成 ビジネスロジック
// =============================================================
//
// 【処理概要】
// 1. Chrome拡張からcm_plaud_sumテーブルに登録されたPlaud録音データを取得
// 2. OpenAI API（gpt-4o-mini）で音声テキストを要約
// 3. 要約結果をcm_plaud_sum_processingテーブルに保存
// 4. PAD（Power Automate Desktop）用のRPAリクエストをrpa_command_requestsに作成
// 5. PADがカイポケに支援経過を登録/更新
//
// 【処理フロー】
// cm_plaud_sum → [Clone API] → cm_plaud_sum_processing → rpa_command_requests → [PAD] → カイポケ
//
// 【例外処理】
// - 要約検証（文字数、前置き、禁止文字）
// - リトライ時プロンプト強化
// - システムエラー通知（LINE WORKS）
//
// =============================================================

import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { getPromptWithVariables } from "@/lib/prompt-template";
import { validateSummary, getRetryPromptAddition, SummaryValidationErrorType } from "@/lib/plaud_support_progress_summary/validation";
import {
  sendDeleteRequestNotification,
  sendSystemErrorNotification,
  sendRetryLimitExceededNotification,
  sendValidationErrorNotification,
} from "@/lib/plaud_support_progress_summary/notification";

// -------------------------------------------------------------
// Supabase Admin Client（RLSバイパス）
// -------------------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// -------------------------------------------------------------
// OpenAI Client
// -------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// -------------------------------------------------------------
// 定数
// -------------------------------------------------------------

// RPAテンプレートID（カイポケ支援経過登録用）
const RPA_TEMPLATE_ID = process.env.PLAUD_SUM_RPA_TEMPLATE_ID || "";

// プロンプトテンプレートのキー
const PROMPT_TEMPLATE_KEY = "cm_plaud_support_progress_summary";

// デフォルトの最大リトライ回数
const DEFAULT_MAX_RETRIES = 2;

// =============================================================
// 型定義
// =============================================================

/**
 * cm_plaud_sum テーブルの型
 */
type PlaudSum = {
  id: string;
  plaud_id: string;
  user_id: string;
  kaipoke_cs_id: string | null;
  title: string | null;
  contents: string | null;
  plaud_created_at: string | null;
  plaud_updated_at: string | null;
};

/**
 * cm_plaud_sum_processing テーブルの型
 */
type PlaudSumProcessing = {
  id: string;
  plaud_sum_id: string;
  plaud_id: string;
  user_id: string;
  kaipoke_cs_id: string | null;
  original_contents: string | null;
  plaud_created_at: string | null;
  status: string;
  summary: string | null;
  process_type: "insert" | "update";
  kaipoke_edit_id: string | null;
  rpa_request_id: string | null;
  error_message: string | null;
  error_type: string | null;
  error_count: number;
  retry_count: number;
  max_retries: number;
};

export type PlaudSupportProgressSummaryOptions = {
  dryRun?: boolean;
  fromDate?: string;
  limit?: number;
};

export type PlaudSupportProgressSummaryResult = {
  ok: boolean;
  processed: number;
  skipped: number;
  errors: number;
  results: PlaudSupportProgressSummaryItemResult[];
  dryRun: boolean;
};

export type PlaudSupportProgressSummaryItemResult = {
  plaud_sum_id: string;
  success: boolean;
  processing_id?: string;
  rpa_request_id?: string;
  process_type?: "insert" | "update";
  summary?: string;
  error?: string;
  errorType?: string;
  skipped?: boolean;
  skip_reason?: string;
};

// =============================================================
// メイン処理
// =============================================================

export async function runPlaudSupportProgressSummary(
  options: PlaudSupportProgressSummaryOptions = {}
): Promise<PlaudSupportProgressSummaryResult> {
  const { dryRun = false, fromDate, limit } = options;

  console.log(`[plaud_support_progress_summary] 開始 dryRun=${dryRun}, fromDate=${fromDate}, limit=${limit}`);

  // 処理対象を取得
  const targets = await getProcessingTargets({ fromDate, limit });

  if (targets.length === 0) {
    console.log("[plaud_support_progress_summary] 処理対象なし");
    return {
      ok: true,
      processed: 0,
      skipped: 0,
      errors: 0,
      results: [],
      dryRun,
    };
  }

  console.log(`[plaud_support_progress_summary] 処理対象: ${targets.length}件`);

  const results: PlaudSupportProgressSummaryItemResult[] = [];
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const target of targets) {
    try {
      const result = await processPlaudSum(target.plaudSum, target.existingProcessing, dryRun);
      results.push(result);

      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        processed++;
      } else {
        errors++;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[plaud_support_progress_summary] エラー plaud_sum_id=${target.plaudSum.id}:`, errorMsg);
      
      // システムエラー通知
      await sendSystemErrorNotification({
        errorType: 'UNEXPECTED_ERROR',
        errorMessage: errorMsg,
        plaud_sum_id: target.plaudSum.id,
        plaud_id: target.plaudSum.plaud_id,
        user_id: target.plaudSum.user_id,
      });

      results.push({
        plaud_sum_id: target.plaudSum.id,
        success: false,
        error: errorMsg,
        errorType: 'UNEXPECTED_ERROR',
      });
      errors++;
    }
  }

  console.log(`[plaud_support_progress_summary] 完了 processed=${processed}, skipped=${skipped}, errors=${errors}`);

  return {
    ok: errors === 0,
    processed,
    skipped,
    errors,
    results,
    dryRun,
  };
}

// =============================================================
// 処理対象取得
// =============================================================

type ProcessingTarget = {
  plaudSum: PlaudSum;
  existingProcessing: PlaudSumProcessing | null;
  isNew: boolean;
};

async function getProcessingTargets(options: {
  fromDate?: string;
  limit?: number;
}): Promise<ProcessingTarget[]> {
  const { fromDate, limit } = options;
  const targets: ProcessingTarget[] = [];

  // 1. 新規データを取得
  let plaudSumQuery = supabase
    .from("cm_plaud_sum")
    .select("*")
    .not("contents", "is", null)
    .order("plaud_created_at", { ascending: false });

  if (fromDate) {
    plaudSumQuery = plaudSumQuery.gte("plaud_created_at", fromDate);
  }

  const { data: plaudSumList, error: plaudSumError } = await plaudSumQuery;

  if (plaudSumError) {
    console.error("[plaud_support_progress_summary] cm_plaud_sum取得エラー:", plaudSumError);
    return [];
  }

  const plaudSumIds = (plaudSumList || []).map((p: PlaudSum) => p.id);
  const existingProcessingMap: Map<string, PlaudSumProcessing> = new Map();

  if (plaudSumIds.length > 0) {
    const { data: existingList } = await supabase
      .from("cm_plaud_sum_processing")
      .select("*")
      .in("plaud_sum_id", plaudSumIds);

    if (existingList) {
      for (const proc of existingList as PlaudSumProcessing[]) {
        existingProcessingMap.set(proc.plaud_sum_id, proc);
      }
    }
  }

  // 新規データを抽出
  for (const plaudSum of (plaudSumList || []) as PlaudSum[]) {
    const existing = existingProcessingMap.get(plaudSum.id);
    if (!existing) {
      targets.push({
        plaudSum,
        existingProcessing: null,
        isNew: true,
      });
    }
  }

  // 2. リトライ対象を取得
  const { data: retryList } = await supabase
    .from("cm_plaud_sum_processing")
    .select("*")
    .eq("status", "error")
    .order("created_at", { ascending: true });

  if (retryList) {
    // リトライ可能なものをフィルタ（retry_count < max_retries）
    const retryTargets = (retryList as PlaudSumProcessing[]).filter(
      proc => proc.retry_count < proc.max_retries
    );

    const retryPlaudSumIds = retryTargets.map(proc => proc.plaud_sum_id);

    if (retryPlaudSumIds.length > 0) {
      const { data: retryPlaudSums } = await supabase
        .from("cm_plaud_sum")
        .select("*")
        .in("id", retryPlaudSumIds);

      if (retryPlaudSums) {
        const retryPlaudSumMap = new Map<string, PlaudSum>();
        for (const ps of retryPlaudSums as PlaudSum[]) {
          retryPlaudSumMap.set(ps.id, ps);
        }

        for (const proc of retryTargets) {
          const plaudSum = retryPlaudSumMap.get(proc.plaud_sum_id);
          if (plaudSum) {
            targets.push({
              plaudSum,
              existingProcessing: proc,
              isNew: false,
            });
          }
        }
      }
    }
  }

  // ソート: 新規 → リトライ
  targets.sort((a, b) => {
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;
    return 0;
  });

  // limit適用
  if (limit && limit > 0 && targets.length > limit) {
    return targets.slice(0, limit);
  }

  return targets;
}

// =============================================================
// 個別レコード処理
// =============================================================

async function processPlaudSum(
  plaudSum: PlaudSum,
  existingProcessing: PlaudSumProcessing | null,
  dryRun: boolean
): Promise<PlaudSupportProgressSummaryItemResult> {
  const plaud_sum_id = plaudSum.id;
  const existing = existingProcessing;
  const isRetry = existing !== null && existing.status === "error";
  const currentRetryCount = existing?.retry_count || 0;
  const maxRetries = existing?.max_retries || DEFAULT_MAX_RETRIES;

  // ─────────────────────────────────────────────────────────────
  // バリデーション
  // ─────────────────────────────────────────────────────────────

  // contentsが空の場合はスキップ
  if (!plaudSum.contents || plaudSum.contents.trim() === "") {
    return {
      plaud_sum_id,
      success: true,
      skipped: true,
      skip_reason: "contents is empty",
    };
  }

  // 既に処理完了済みの場合はスキップ
  if (existing && existing.status === "completed") {
    return {
      plaud_sum_id,
      success: true,
      skipped: true,
      skip_reason: "already completed",
    };
  }

  // リトライ上限チェック
  if (isRetry && currentRetryCount >= maxRetries) {
    // リトライ上限超過通知
    await sendRetryLimitExceededNotification({
      errorType: existing?.error_type || 'UNKNOWN',
      errorMessage: existing?.error_message || 'Unknown error',
      retryCount: currentRetryCount,
      maxRetries,
      plaud_sum_id,
      plaud_id: plaudSum.plaud_id,
      user_id: plaudSum.user_id,
    });

    return {
      plaud_sum_id,
      success: false,
      error: `リトライ上限超過 (${currentRetryCount}/${maxRetries})`,
      errorType: 'RETRY_LIMIT_EXCEEDED',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // kaipoke_cs_id 変更チェック
  // ─────────────────────────────────────────────────────────────
  let needsDeleteNotification = false;
  let oldKaipokeEditId: string | null = null;
  let oldKaipokeCsId: string | null = null;

  if (existing && existing.kaipoke_edit_id) {
    if (existing.kaipoke_cs_id !== plaudSum.kaipoke_cs_id) {
      needsDeleteNotification = true;
      oldKaipokeEditId = existing.kaipoke_edit_id;
      oldKaipokeCsId = existing.kaipoke_cs_id;
    }
  }

  // process_type 判定
  let processType: "insert" | "update" = "insert";
  if (existing && existing.kaipoke_edit_id && !needsDeleteNotification) {
    processType = "update";
  }

  // ─────────────────────────────────────────────────────────────
  // OpenAI API で要約生成
  // ─────────────────────────────────────────────────────────────
  let summary: string;
  let validationErrorType: SummaryValidationErrorType | undefined;

  try {
    // リトライ時は前回のエラー種別を取得
    const previousErrorType = existing?.error_type as SummaryValidationErrorType | undefined;
    
    summary = await generateSummary(
      plaudSum.contents,
      isRetry ? currentRetryCount + 1 : 0,
      previousErrorType
    );

    // 要約の検証
    const validationResult = validateSummary(summary);
    if (!validationResult.valid) {
      validationErrorType = validationResult.errorType;
      throw new Error(validationResult.error);
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const errorType = validationErrorType || 'OPENAI_API_ERROR';

    // エラー状態を保存
    if (!dryRun) {
      await saveErrorState(plaudSum, existing, errorMsg, errorType, isRetry);
    }

    // リトライ上限に達した場合は通知
    const newRetryCount = isRetry ? currentRetryCount + 1 : 0;
    if (newRetryCount >= maxRetries) {
      if (validationErrorType) {
        await sendValidationErrorNotification({
          errorType,
          errorMessage: errorMsg,
          retryCount: newRetryCount,
          maxRetries,
          plaud_sum_id,
          plaud_id: plaudSum.plaud_id,
          user_id: plaudSum.user_id,
          summary: typeof summary === 'string' ? summary : undefined,
        });
      } else {
        await sendSystemErrorNotification({
          errorType,
          errorMessage: errorMsg,
          retryCount: newRetryCount,
          maxRetries,
          plaud_sum_id,
          plaud_id: plaudSum.plaud_id,
          user_id: plaudSum.user_id,
        });
      }
    }

    return {
      plaud_sum_id,
      success: false,
      error: errorMsg,
      errorType,
    };
  }

  // dryRun の場合はここで終了
  if (dryRun) {
    return {
      plaud_sum_id,
      success: true,
      process_type: processType,
      summary,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // DB操作
  // ─────────────────────────────────────────────────────────────
  let processingId: string;

  try {
    if (existing) {
      // 既存レコード更新
      const updateData: Record<string, string | number | null> = {
        original_contents: plaudSum.contents,
        kaipoke_cs_id: plaudSum.kaipoke_cs_id,
        status: "summarized",
        summary,
        process_type: processType,
        error_message: null,
        error_type: null,
        summarized_at: new Date().toISOString(),
      };

      if (isRetry) {
        updateData.retry_count = currentRetryCount + 1;
      }

      if (needsDeleteNotification) {
        updateData.kaipoke_edit_id = null;
        updateData.process_type = "insert";
        processType = "insert";
      }

      const { error: updateError } = await supabase
        .from("cm_plaud_sum_processing")
        .update(updateData)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(`Failed to update processing: ${updateError.message}`);
      }

      processingId = existing.id;
    } else {
      // 新規レコード作成
      const { data: newProcessing, error: insertError } = await supabase
        .from("cm_plaud_sum_processing")
        .insert({
          plaud_sum_id: plaudSum.id,
          plaud_id: plaudSum.plaud_id,
          user_id: plaudSum.user_id,
          kaipoke_cs_id: plaudSum.kaipoke_cs_id,
          original_contents: plaudSum.contents,
          plaud_created_at: plaudSum.plaud_created_at,
          status: "summarized",
          summary,
          process_type: processType,
          max_retries: DEFAULT_MAX_RETRIES,
          summarized_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (insertError || !newProcessing) {
        throw new Error(`Failed to create processing: ${insertError?.message}`);
      }

      processingId = newProcessing.id;
    }
  } catch (dbError) {
    const errorMsg = dbError instanceof Error ? dbError.message : "DB error";
    
    await sendSystemErrorNotification({
      errorType: 'DB_ERROR',
      errorMessage: errorMsg,
      plaud_sum_id,
      plaud_id: plaudSum.plaud_id,
      user_id: plaudSum.user_id,
    });

    return {
      plaud_sum_id,
      success: false,
      error: errorMsg,
      errorType: 'DB_ERROR',
    };
  }

  // ─────────────────────────────────────────────────────────────
  // kaipoke_cs_id 変更時の通知
  // ─────────────────────────────────────────────────────────────
  if (needsDeleteNotification) {
    await sendDeleteRequestNotification({
      oldKaipokeCsId,
      newKaipokeCsId: plaudSum.kaipoke_cs_id,
      kaipoke_edit_id: oldKaipokeEditId,
      plaud_created_at: plaudSum.plaud_created_at,
      plaud_sum_id,
      plaud_id: plaudSum.plaud_id,
      user_id: plaudSum.user_id,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // RPAリクエスト作成
  // ─────────────────────────────────────────────────────────────
  if (!RPA_TEMPLATE_ID) {
    const errorMsg = "PLAUD_SUM_RPA_TEMPLATE_ID is not configured";
    
    await sendSystemErrorNotification({
      errorType: 'CONFIG_ERROR',
      errorMessage: errorMsg,
      plaud_sum_id,
      plaud_id: plaudSum.plaud_id,
      user_id: plaudSum.user_id,
    });

    return {
      plaud_sum_id,
      success: false,
      error: errorMsg,
      errorType: 'CONFIG_ERROR',
    };
  }

  const rpaRequestDetails = {
    plaud_sum_id: plaudSum.id,
    processing_id: processingId,
    plaud_id: plaudSum.plaud_id,
    kaipoke_cs_id: plaudSum.kaipoke_cs_id,
    summary,
    process_type: processType,
    kaipoke_edit_id: processType === "update" ? existing?.kaipoke_edit_id : null,
    target_date: plaudSum.plaud_created_at,
  };

  const { data: rpaRequest, error: rpaError } = await supabase
    .from("rpa_command_requests")
    .insert({
      template_id: RPA_TEMPLATE_ID,
      requester_id: plaudSum.user_id,
      status: "approved",
      status_label: "approved",
      request_details: rpaRequestDetails,
      requested_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (rpaError || !rpaRequest) {
    const errorMsg = `Failed to create RPA request: ${rpaError?.message}`;
    
    await sendSystemErrorNotification({
      errorType: 'RPA_REQUEST_ERROR',
      errorMessage: errorMsg,
      plaud_sum_id,
      plaud_id: plaudSum.plaud_id,
      user_id: plaudSum.user_id,
    });

    // エラー状態を保存
    await supabase
      .from("cm_plaud_sum_processing")
      .update({
        status: "error",
        error_message: errorMsg,
        error_type: 'RPA_REQUEST_ERROR',
        error_count: (existing?.error_count || 0) + 1,
        last_error_at: new Date().toISOString(),
      })
      .eq("id", processingId);

    return {
      plaud_sum_id,
      success: false,
      error: errorMsg,
      errorType: 'RPA_REQUEST_ERROR',
    };
  }

  // 処理完了
  await supabase
    .from("cm_plaud_sum_processing")
    .update({
      status: "completed",
      rpa_request_id: rpaRequest.id,
      rpa_requested_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq("id", processingId);

  return {
    plaud_sum_id,
    success: true,
    processing_id: processingId,
    rpa_request_id: rpaRequest.id,
    process_type: processType,
    summary,
  };
}

// =============================================================
// エラー状態保存
// =============================================================

async function saveErrorState(
  plaudSum: PlaudSum,
  existing: PlaudSumProcessing | null,
  errorMsg: string,
  errorType: string,
  isRetry: boolean
): Promise<void> {
  if (existing) {
    await supabase
      .from("cm_plaud_sum_processing")
      .update({
        status: "error",
        error_message: errorMsg,
        error_type: errorType,
        error_count: (existing.error_count || 0) + 1,
        retry_count: isRetry ? (existing.retry_count || 0) + 1 : (existing.retry_count || 0),
        last_error_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("cm_plaud_sum_processing")
      .insert({
        plaud_sum_id: plaudSum.id,
        plaud_id: plaudSum.plaud_id,
        user_id: plaudSum.user_id,
        kaipoke_cs_id: plaudSum.kaipoke_cs_id,
        original_contents: plaudSum.contents,
        plaud_created_at: plaudSum.plaud_created_at,
        status: "error",
        error_message: errorMsg,
        error_type: errorType,
        error_count: 1,
        retry_count: 0,
        max_retries: DEFAULT_MAX_RETRIES,
        last_error_at: new Date().toISOString(),
      });
  }
}

// =============================================================
// OpenAI 要約生成
// =============================================================

async function generateSummary(
  contents: string,
  retryCount: number,
  previousErrorType?: SummaryValidationErrorType
): Promise<string> {
  // プロンプトテンプレートを取得
  const promptResult = await getPromptWithVariables(PROMPT_TEMPLATE_KEY, {
    contents,
  });

  // リトライ時はプロンプトを強化
  let finalPrompt = promptResult.prompt;
  const additionalPrompt = getRetryPromptAddition(retryCount, previousErrorType);
  if (additionalPrompt) {
    finalPrompt += additionalPrompt;
    console.log(`[plaud_support_progress_summary] リトライ ${retryCount}回目: プロンプト強化`);
  }

  console.log(`[plaud_support_progress_summary] Using prompt template: ${promptResult.templateKey}`);

  // OpenAI API呼び出し
  const response = await openai.chat.completions.create({
    model: promptResult.model,
    max_tokens: promptResult.max_tokens,
    temperature: promptResult.temperature,
    messages: [
      { role: "user", content: finalPrompt },
    ],
  });

  const rawResponse = response.choices[0]?.message?.content?.trim();

  if (!rawResponse) {
    throw new Error("OpenAI returned empty response");
  }

  // JSONパース
  try {
    let jsonStr = rawResponse;
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    const parsed = JSON.parse(jsonStr);

    if (parsed.sum === undefined || parsed.sum === null) {
      throw new Error("Invalid JSON structure: 'sum' field not found");
    }

    if (typeof parsed.sum === "string") {
      return parsed.sum;
    }

    if (typeof parsed.sum === "object") {
      const summaryParts: string[] = [];
      for (const [heading, content] of Object.entries(parsed.sum)) {
        summaryParts.push(`${heading}\n${content}`);
      }
      return summaryParts.join("\n\n");
    }

    return String(parsed.sum);

  } catch (parseError) {
    console.error("[plaud_support_progress_summary] JSON parse error:", parseError, "Raw response:", rawResponse);
    // パースエラー時でも生レスポンスを返して検証させる
    return rawResponse;
  }
}
