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

export async function POST(req: Request) {
  const supabase = sb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
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
        await client.messages.create({
          to,
          ...(messagingServiceSid ? { messagingServiceSid } : { from: fromNumber }),
          body: bodyText,
        })
        success++
        await supabase
          .from('taimee_employees_monthly')
          .update({ last_sent_at: new Date().toISOString() })
          .eq('period_month', rcp.period_month)
          .eq('taimee_user_id', rcp.taimee_user_id)
      } catch (err) {
        // 必要ならログ（削除可）
        console.error('Twilio send failed for', to, err)
        failed++
      }
    }

    return Res.json({ ok: true, success, failed })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Res.json({ ok: false, error: msg }, { status: 500 })
  }
}
