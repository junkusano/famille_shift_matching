// app/api/taimee-emp/send/route.ts
import { NextResponse as Res } from 'next/server'
import { createClient as sb } from '@supabase/supabase-js'
import twilio from 'twilio'

interface RecipientPayload {
  key: string
  phone: string
  last: string
  first: string
  period_month: string
  taimee_user_id: string
}
interface SendBody {
  message: string
  recipients: RecipientPayload[]
}

// 日本向け E.164 正規化（国内のみ想定）
function toE164JP(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // 既に + から始まる場合は軽く検証して返す
  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '')
    return digits.length >= 10 ? `+${digits}` : null
  }
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('0')) return `+81${digits.slice(1)}`
  if (digits.startsWith('81')) return `+${digits}`
  // それ以外は念のため + を付与（数字のみだったケース）
  return `+${digits}`
}

function twilioFailureDetails(error: unknown) {
  const value = error as {
    code?: unknown
    message?: unknown
    moreInfo?: unknown
  }
  const code = value && typeof value.code !== 'undefined'
    ? String(value.code)
    : null
  const message = value && typeof value.message === 'string'
    ? value.message
    : 'Twilio送信エラー'
  return { code, message }
}

async function excludeFailedRecipient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  applicantId: string,
  reason: string
) {

const { data: applicantData, error: readError } = await supabase
  .from('taimee_applicants')
  .select('memo')
  .eq('id', applicantId)
  .maybeSingle()

const applicant = applicantData as { memo: string | null } | null

  if (readError || !applicant) {
    console.error('[taimee-emp/send] failed to load applicant for exclusion', readError)
    return
  }

  const notice = `【SMS配信エラー】${reason}`
  const memo = String(applicant.memo ?? '').includes(notice)
    ? applicant.memo
    : [applicant.memo, notice].filter(Boolean).join('\n').slice(-4000)
  const { error: updateError } = await supabase
  .from('taimee_applicants')
  .update(
    { send_disabled: true, memo } as never
  )
  .eq('id', applicantId)

  if (updateError) {
    console.error('[taimee-emp/send] failed to exclude recipient', updateError)
  }
}

export async function POST(req: Request) {
  const supabase = sb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) return Res.json({ ok: false, error: 'ログインしてください' }, { status: 401 })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return Res.json({ ok: false, error: 'ログインしてください' }, { status: 401 })
    const { data: staff, error: staffError } = await supabase
      .from('users')
      .select('system_role')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle()
    if (staffError) throw staffError
    if (!['admin', 'manager'].includes((staff?.system_role ?? '').toLowerCase())) {
      return Res.json({ ok: false, error: 'この操作を実行する権限がありません' }, { status: 403 })
    }

    const body: unknown = await req.json()
    const { message, recipients } = body as SendBody
    if (!message || !Array.isArray(recipients) || recipients.length === 0) {
      return Res.json({ ok: false, error: '宛先/本文が不足しています' }, { status: 400 })
    }

    const client = twilio(
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      { accountSid: process.env.TWILIO_ACCOUNT_SID! }
    )

    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
    const fromNumber = process.env.TWILIO_FROM
    if (!messagingServiceSid && !fromNumber) {
      return Res.json(
        { ok: false, error: 'TWILIO_MESSAGING_SERVICE_SID か TWILIO_FROM を設定してください' },
        { status: 500 }
      )
    }

    let success = 0, failed = 0

    for (const rcp of recipients) {
      const to = toE164JP(rcp.phone)
      if (!to) { failed++; continue }

      const bodyText = `${(rcp.last || '') + (rcp.first || '')}様\n${message}`

      try {
        const message = await client.messages.create({
          to,
          ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber }),
          body: bodyText,
        })

        const { error: logError } = await supabase
          .from('taimee_sms_send_logs')
          .insert({
            applicant_id: rcp.key,
            taimee_user_id: rcp.taimee_user_id,
            recipient_phone: to,
            message_body: bodyText,
            twilio_message_sid: message.sid,
            twilio_status: message.status ?? 'queued',
          })
        if (logError) {
          // 送信自体は成功しているため、ログ障害で成功件数を失わない。
          console.error('[taimee-emp/send] failed to create Twilio delivery log', logError)
        }

        success++
        await supabase
          .from('taimee_employees_monthly')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('period_month', rcp.period_month)
          .eq('taimee_user_id', rcp.taimee_user_id)
      } catch (err) {
        const failure = twilioFailureDetails(err)
        const reason = `${failure.code ? `code=${failure.code} / ` : ''}${failure.message}`
        const { error: logError } = await supabase
          .from('taimee_sms_send_logs')
          .insert({
            applicant_id: rcp.key,
            taimee_user_id: rcp.taimee_user_id,
            recipient_phone: to,
            message_body: bodyText,
            twilio_status: 'failed',
            twilio_error_code: failure.code,
            twilio_error_message: failure.message,
            excluded_at: new Date().toISOString(),
          })
        if (logError) console.error('[taimee-emp/send] failed to create failed-send log', logError)
        await excludeFailedRecipient(supabase, rcp.key, reason)
        console.error('[taimee-emp/send] Twilio send failed', { to, ...failure })
        failed++
      }
    }

    return Res.json({ ok: true, success, failed })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Res.json({ ok: false, error: msg }, { status: 500 })
  }
}
