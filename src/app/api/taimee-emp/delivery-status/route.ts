import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { supabaseAdmin } from '@/lib/supabase/service'

export const runtime = 'nodejs'

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return 'Twilio送信結果の確認に失敗しました'
}

async function requireManager(req: NextRequest): Promise<void> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new Error('UNAUTHORIZED')

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) throw new Error('UNAUTHORIZED')

  const { data: staff, error: staffError } = await supabaseAdmin
    .from('users')
    .select('system_role')
    .eq('auth_user_id', data.user.id)
    .maybeSingle()
  if (staffError) throw staffError
  if (!['admin', 'manager'].includes((staff?.system_role ?? '').toLowerCase())) {
    throw new Error('FORBIDDEN')
  }
}

async function excludeFailedRecipient(applicantId: string, reason: string) {
  const { data: applicant, error: readError } = await supabaseAdmin
    .from('taimee_applicants')
    .select('memo')
    .eq('id', applicantId)
    .maybeSingle()
  if (readError || !applicant) throw readError ?? new Error('応募者が見つかりません')

  const notice = `【SMS配信エラー】${reason}`
  const memo = String(applicant.memo ?? '').includes(notice)
    ? applicant.memo
    : [applicant.memo, notice].filter(Boolean).join('\n').slice(-4000)
  const { error: updateError } = await supabaseAdmin
    .from('taimee_applicants')
    .update({ send_disabled: true, memo })
    .eq('id', applicantId)
  if (updateError) throw updateError
}

export async function POST(req: NextRequest) {
  try {
    await requireManager(req)

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid || !apiKeySid || !apiKeySecret) {
      throw new Error('Twilioの認証情報が未設定です')
    }
    const client = twilio(apiKeySid, apiKeySecret, { accountSid })

    const { data: logs, error: logError } = await supabaseAdmin
      .from('taimee_sms_send_logs')
      .select('id,applicant_id,twilio_message_sid')
      .in('twilio_status', ['accepted', 'queued', 'sending', 'sent'])
      .is('excluded_at', null)
      .not('twilio_message_sid', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(500)
    if (logError) throw logError

    let checked = 0
    let delivered = 0
    let excluded = 0
    let pending = 0
    let lookupFailed = 0

    for (const log of logs ?? []) {
      try {
        const message = await client.messages(log.twilio_message_sid).fetch()
        const status = message.status ?? 'unknown'
        const errorCode = message.errorCode == null ? null : String(message.errorCode)
        const errorText = message.errorMessage ?? null
        const isDeliveryFailure = status === 'failed' || status === 'undelivered'

        const { error: updateLogError } = await supabaseAdmin
          .from('taimee_sms_send_logs')
          .update({
            twilio_status: status,
            twilio_error_code: errorCode,
            twilio_error_message: errorText,
            checked_at: new Date().toISOString(),
            ...(isDeliveryFailure ? { excluded_at: new Date().toISOString() } : {}),
          })
          .eq('id', log.id)
        if (updateLogError) throw updateLogError

        checked += 1
        if (isDeliveryFailure) {
          const reason = `${status}${errorCode ? ` / code=${errorCode}` : ''}${errorText ? ` / ${errorText}` : ''}`
          await excludeFailedRecipient(log.applicant_id, reason)
          excluded += 1
        } else if (status === 'delivered') {
          delivered += 1
        } else {
          pending += 1
        }
      } catch (error) {
        lookupFailed += 1
        console.error('[taimee-emp/delivery-status] Twilio lookup failed', {
          logId: log.id,
          message: errorMessage(error),
        })
      }
    }

    return NextResponse.json({ ok: true, checked, delivered, excluded, pending, lookupFailed })
  } catch (error) {
    const rawMessage = errorMessage(error)
    const status = rawMessage === 'UNAUTHORIZED' ? 401 : rawMessage === 'FORBIDDEN' ? 403 : 500
    const message = rawMessage === 'UNAUTHORIZED'
      ? 'ログインしてください'
      : rawMessage === 'FORBIDDEN'
        ? 'この操作を実行する権限がありません'
        : rawMessage
    console.error('[taimee-emp/delivery-status] failed', error)
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
