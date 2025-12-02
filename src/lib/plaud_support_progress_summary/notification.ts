// =============================================================
// src/lib/plaud_support_progress_summary/notification.ts
// Plaud支援経過要約 LINE WORKS通知ユーティリティ
// =============================================================
//
// 【概要】
// LINE WORKSへの通知を管理する
// - 業務通知: 手動削除依頼など
// - システムエラー通知: OpenAIエラー、DBエラーなど
//
// 【チャンネル使い分け】
// - 業務通知チャンネル: LINEWORKS_NOTIFY_CHANNEL_ID（環境変数）
// - システムエラーチャンネル: LINEWORKS_SYSTEM_ERROR_CHANNEL_ID（固定値）
//
// =============================================================

import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";

// =============================================================
// 定数
// =============================================================

/**
 * 業務通知チャンネルID（環境変数から取得）
 * - kaipoke_cs_id変更時の手動削除依頼
 */
const BUSINESS_NOTIFY_CHANNEL_ID = process.env.LINEWORKS_NOTIFY_CHANNEL_ID || "";

/**
 * システムエラー通知チャンネルID（固定値）
 * - OpenAIエラー
 * - DBエラー
 * - 検証エラー（リトライ上限超過時）
 */
const SYSTEM_ERROR_CHANNEL_ID = "df3165aa-c990-e7f5-07a5-e0fa4c055797";

// =============================================================
// 型定義
// =============================================================

/**
 * 通知種別
 */
export type NotificationType =
  | 'DELETE_REQUEST'        // 手動削除依頼（業務）
  | 'SYSTEM_ERROR'          // システムエラー
  | 'VALIDATION_ERROR'      // 検証エラー（リトライ上限超過）
  | 'RETRY_LIMIT_EXCEEDED'; // リトライ上限超過

/**
 * 通知パラメータの基本型
 */
type BaseNotificationParams = {
  plaud_sum_id?: string;
  plaud_id?: string;
  user_id?: string;
};

/**
 * 手動削除依頼の通知パラメータ
 */
export type DeleteRequestParams = BaseNotificationParams & {
  oldKaipokeCsId: string | null;
  newKaipokeCsId: string | null;
  kaipoke_edit_id: string | null;
  plaud_created_at: string | null;
};

/**
 * システムエラーの通知パラメータ
 */
export type SystemErrorParams = BaseNotificationParams & {
  errorType: string;
  errorMessage: string;
  retryCount?: number;
  maxRetries?: number;
};

// =============================================================
// メイン関数
// =============================================================

/**
 * 手動削除依頼を送信する（業務通知チャンネル）
 * 
 * @param params - 通知パラメータ
 */
export async function sendDeleteRequestNotification(params: DeleteRequestParams): Promise<void> {
  if (!BUSINESS_NOTIFY_CHANNEL_ID) {
    console.warn("[notification] LINEWORKS_NOTIFY_CHANNEL_ID が未設定です");
    return;
  }

  const message = `【カイポケ 手動削除依頼】

旧利用者ID: ${params.oldKaipokeCsId || "不明"}
新利用者ID: ${params.newKaipokeCsId || "不明"}
削除対象idEdit: ${params.kaipoke_edit_id || "不明"}
登録日: ${params.plaud_created_at ? new Date(params.plaud_created_at).toLocaleDateString("ja-JP") : "不明"}

依頼内容: カイポケの支援経過画面から該当データを手動で削除してください。`;

  await sendNotification(BUSINESS_NOTIFY_CHANNEL_ID, message, 'DELETE_REQUEST');
}

/**
 * システムエラー通知を送信する（システムエラーチャンネル）
 * 
 * @param params - 通知パラメータ
 */
export async function sendSystemErrorNotification(params: SystemErrorParams): Promise<void> {
  const retryInfo = params.retryCount !== undefined && params.maxRetries !== undefined
    ? `\nリトライ: ${params.retryCount}/${params.maxRetries}`
    : '';

  const message = `【カイポケ支援経過登録 エラー】

エラー種別: ${params.errorType}
エラー内容: ${params.errorMessage}
${retryInfo}
plaud_sum_id: ${params.plaud_sum_id || "不明"}
plaud_id: ${params.plaud_id || "不明"}
user_id: ${params.user_id || "不明"}
発生日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`;

  await sendNotification(SYSTEM_ERROR_CHANNEL_ID, message, 'SYSTEM_ERROR');
}

/**
 * リトライ上限超過の通知を送信する（システムエラーチャンネル）
 * 
 * @param params - 通知パラメータ
 */
export async function sendRetryLimitExceededNotification(params: SystemErrorParams): Promise<void> {
  const message = `【カイポケ支援経過登録 リトライ上限超過】

最終エラー: ${params.errorMessage}
リトライ回数: ${params.retryCount}/${params.maxRetries}

plaud_sum_id: ${params.plaud_sum_id || "不明"}
plaud_id: ${params.plaud_id || "不明"}
user_id: ${params.user_id || "不明"}

対応: 手動でステータスをリセットしてください。
1. plaud_sum_processingのレコードを確認
2. error_messageを確認し原因を特定
3. 原因を解決後、retry_countを0にリセット
4. statusをpendingに変更`;

  await sendNotification(SYSTEM_ERROR_CHANNEL_ID, message, 'RETRY_LIMIT_EXCEEDED');
}

/**
 * 検証エラー（リトライ上限超過後）の通知を送信する
 * 
 * @param params - 通知パラメータ
 */
export async function sendValidationErrorNotification(params: SystemErrorParams & {
  summary?: string;
}): Promise<void> {
  const summaryPreview = params.summary 
    ? `\n要約プレビュー: ${params.summary.substring(0, 100)}...`
    : '';

  const message = `【カイポケ支援経過登録 検証エラー】

エラー種別: ${params.errorType}
エラー内容: ${params.errorMessage}
${summaryPreview}

plaud_sum_id: ${params.plaud_sum_id || "不明"}
plaud_id: ${params.plaud_id || "不明"}
user_id: ${params.user_id || "不明"}
リトライ: ${params.retryCount}/${params.maxRetries}

対応: プロンプトの調整が必要な可能性があります。`;

  await sendNotification(SYSTEM_ERROR_CHANNEL_ID, message, 'VALIDATION_ERROR');
}

// =============================================================
// 内部関数
// =============================================================

/**
 * LINE WORKSに通知を送信する（共通処理）
 * 
 * @param channelId - 送信先チャンネルID
 * @param message - メッセージ本文
 * @param type - 通知種別（ログ用）
 */
async function sendNotification(
  channelId: string,
  message: string,
  type: NotificationType
): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    await sendLWBotMessage(channelId, message, accessToken);
    console.log(`[notification] ${type} 通知送信完了 channel=${channelId}`);
  } catch (error) {
    // LINE WORKS送信失敗はログ出力のみ（処理は継続）
    console.error(`[notification] ${type} 通知送信失敗:`, error);
  }
}
