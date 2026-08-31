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
  return [
    '【RPAエラー】',
    `処理名: ${alert.jobType}`,
    `発生日時（JST）: ${jst()}`,
    `Runner: ${alert.runnerName} / ${alert.runnerId}`,
    `Job ID: ${alert.jobId}`,
    `エラー分類: ${alert.errorCategory}`,
    `概要: ${sanitizeRpaAlertText(alert.errorMessage)}`,
    `再試行回数: ${alert.retryCount}`,
    '最終ステータス: failed',
    '',
    '端末またはRPA Runner管理画面で詳細を確認してください',
  ].join('\n');
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
