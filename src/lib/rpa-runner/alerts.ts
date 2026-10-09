import { createHash } from 'node:crypto';
import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';
import { supabaseAdmin } from '@/lib/supabase/service';

const CHANNEL_ID = '99142491';
const SUPPRESSION_MS = 30 * 60 * 1000;
const SECRET_PATTERN = /(authorization\s*[:=]\s*(?:bearer\s+)?\S+|bearer\s+\S+|(?:rpa_|twilio[ _-]?(?:auth )?)(?:token|secret)\s*[:=]\s*\S+|cookie\s*[:=]\s*\S+)/gi;

export type RpaFailureAlert = {
  jobId: string;
  runnerId: string;
  runnerName: string;
  jobType: string;
  errorCode: string;
  errorCategory: string;
  errorMessage: string;
  retryCount: number;
  sharefullTemplateFailure?: boolean;
  sharefullTemplateAttempt?: number;
  sharefullTemplateManualReview?: boolean;
};

export function sanitizeRpaAlertText(value: string): string {
  return value.replace(SECRET_PATTERN, '[redacted]').replace(/\+?\d[\d\s-]{8,}\d/g, '[redacted-phone]').replace(/\s+/g, ' ').trim().slice(0, 300);
}

export function rpaErrorFingerprint(input: Pick<RpaFailureAlert, 'runnerId' | 'jobType' | 'errorCategory' | 'errorCode'>): string {
  return createHash('sha256').update(`${input.runnerId}|${input.jobType}|${input.errorCategory}|${input.errorCode}`).digest('hex');
}

function jst(value = new Date()): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(value);
}

function message(alert: RpaFailureAlert): string {
  const templateRetryState = alert.sharefullTemplateFailure
    ? alert.sharefullTemplateManualReview
      ? '自動再試行: 停止中（Sharefull作成済み・MyFamilleのID未記録の可能性があるため、重複防止の手動照合が必要です）。'
      : alert.sharefullTemplateAttempt !== undefined && alert.sharefullTemplateAttempt >= 3
      ? '自動再試行: 上限到達（3/3回）。以後は自動再投入されません。'
      : `自動再試行: 1時間後以降のCronで再投入予定（${alert.sharefullTemplateAttempt ?? 1}/3回目）。`
    : null;
  return [
    '【RPAエラー】',
    `処理名: ${alert.jobType}`,
    `発生日時（JST）: ${jst()}`,
    `Runner: ${alert.runnerName} / ${alert.runnerId}`,
    `Job ID: ${alert.jobId}`,
    `エラー分類: ${alert.errorCategory}`,
    `概要: ${sanitizeRpaAlertText(alert.errorMessage)}`,
    `再試行回数: ${alert.retryCount}`,
    templateRetryState,
    alert.sharefullTemplateFailure ? 'Sharefull側でテンプレート作成が完了したかは未確認です。Sharefull画面を確認し、作成済みならMyFamilleへのID反映を確認してください。' : null,
    '最終ステータス: failed',
    '',
    '端末またはRPA Runner管理画面で詳細を確認してください',
  ].filter((line): line is string => line !== null).join('\n');
}

/** 失敗は必ずDBへ記録し、同じ未復旧原因のLINE WORKS通知は30分抑制する。 */
export async function notifyRpaJobFailure(alert: RpaFailureAlert): Promise<void> {
  const fingerprint = rpaErrorFingerprint(alert);
  const cutoff = new Date(Date.now() - SUPPRESSION_MS).toISOString();
  const { data: active } = await supabaseAdmin.from('rpa_runner_alerts')
    .select('id').eq('fingerprint', fingerprint).is('resolved_at', null).gte('created_at', cutoff).limit(1).maybeSingle();
  const { data: row, error: insertError } = await supabaseAdmin.from('rpa_runner_alerts').insert({
    job_id: alert.jobId, runner_id: alert.runnerId, job_type: alert.jobType, error_category: alert.errorCategory,
    error_code: alert.errorCode, fingerprint, summary: sanitizeRpaAlertText(alert.errorMessage), retry_count: alert.retryCount,
    suppressed_by_alert_id: active?.id ?? null,
  }).select('id').single();
  if (insertError || !row) return;
  if (active) return;
  try {
    await sendLWBotMessage(CHANNEL_ID, message(alert), await getAccessToken());
    await supabaseAdmin.from('rpa_runner_alerts').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
    await supabaseAdmin.from('rpa_runner_jobs').update({ lineworks_notified_at: new Date().toISOString() }).eq('id', alert.jobId);
  } catch (error) {
    const deliveryError = sanitizeRpaAlertText(error instanceof Error ? error.message : String(error));
    await supabaseAdmin.from('rpa_runner_alerts').update({ notification_error: deliveryError }).eq('id', row.id);
  }
}

/** 正常完了した同種の処理は、未復旧アラートを解消済みにして次回障害を通知可能にする。 */
export async function resolveRpaFailureAlerts(runnerId: string, jobType: string): Promise<void> {
  await supabaseAdmin.from('rpa_runner_alerts').update({ resolved_at: new Date().toISOString() })
    .eq('runner_id', runnerId).eq('job_type', jobType).is('resolved_at', null);
}
