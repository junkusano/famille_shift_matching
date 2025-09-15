// app/api/sms/send/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import twilio, { Twilio } from 'twilio'

type Item = { phone: string; body: string }

function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    try { return JSON.stringify(err) } catch { return 'Unknown error' }
}

function createTwilioClient(): Twilio {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET
    if (!accountSid || !apiKeySid || !apiKeySecret) {
        throw new Error('Twilioの環境変数（ACCOUNT_SID / API_KEY_SID / API_KEY_SECRET）が未設定です')
    }
    return twilio(apiKeySid, apiKeySecret, { accountSid })
}

const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
const QUIET_START = Number(process.env.QUIET_HOURS_START ?? 21)
const QUIET_END = Number(process.env.QUIET_HOURS_END ?? 8)
const RATE_PER_SEC = Number(process.env.SMS_RATE_PER_SEC ?? 10)

function inQuietHours(now = new Date()): boolean {
    const jst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const h = jst.getHours()
    return (QUIET_START > QUIET_END) ? (h >= QUIET_START || h < QUIET_END) : (h >= QUIET_START && h < QUIET_END)
}

function withStop(body: string): string {
    return /stop/i.test(body) ? body : `${body}\n\n配信停止: 返信で STOP`
}

export async function POST(req: NextRequest) {
    try {
        if (!messagingServiceSid) throw new Error('TWILIO_MESSAGING_SERVICE_SID が未設定です')
        if (inQuietHours()) {
            return NextResponse.json({ ok: false, error: '静かな時間帯のため送信を抑止しました（QUIET_HOURS_* で変更可）' }, { status: 400 })
        }

        const payload = (await req.json()) as { items?: Item[] }
        const items = payload.items ?? []
        if (items.length === 0) throw new Error('送信対象がありません')

        const client = createTwilioClient()
        const sids: string[] = []
        let i = 0

        for (const it of items) {
            const body = withStop(String(it.body || '')).slice(0, 1600)
            // eslint-disable-next-line no-await-in-loop
            const msg = await client.messages.create({
                to: it.phone,
                body,
                messagingServiceSid,
            })
            sids.push(msg.sid)
            i++
            if (RATE_PER_SEC > 0 && i % RATE_PER_SEC === 0) {
                // eslint-disable-next-line no-await-in-loop
                await new Promise(r => setTimeout(r, 1000))
            }
        }

        return NextResponse.json({ ok: true, total: items.length, sent: sids.length, sids })
    } catch (err: unknown) {
        return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 400 })
    }
}
