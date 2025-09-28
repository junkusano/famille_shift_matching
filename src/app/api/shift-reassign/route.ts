// /src/app/api/shift-reassign/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  shiftId: string | number
  fromUserId: string
  toUserId: string
  reason?: string
}

function normalizeBody(v: unknown): Body | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const body: Body = {
    shiftId: (o.shiftId ?? o.shift_id) as string | number,
    fromUserId: String(o.fromUserId ?? o.from_user_id ?? '').trim(),
    toUserId:   String(o.toUserId   ?? o.to_user_id   ?? '').trim(),
    reason:     o.reason === undefined ? undefined : String(o.reason),
  }
  if (
    body.shiftId === undefined || body.shiftId === null ||
    body.fromUserId.length === 0 || body.toUserId.length === 0
  ) return null
  return body
}

export async function POST(req: Request) {
  try {
    const ct = req.headers.get('content-type') || ''
    const raw = await req.text()
    console.log('[api/shift-reassign] ct=', ct, 'raw.len=', raw.length, 'head=', raw.slice(0, 200))

    let parsed: unknown = null
    try { parsed = raw ? JSON.parse(raw) : null } catch (e) {
      console.error('[api/shift-reassign] JSON.parse error:', e)
      return NextResponse.json({ error: 'bad_json' }, { status: 400 })
    }

    const body = normalizeBody(parsed)
    if (!body) {
      console.warn('[api/shift-reassign] bad_request parsed=', parsed)
      return NextResponse.json(
        { error: "bad_request: expected 'shiftId|shift_id', 'fromUserId|from_user_id', 'toUserId|to_user_id'" },
        { status: 400 }
      )
    }

    const shiftIdNum = Number(body.shiftId)
    if (!Number.isFinite(shiftIdNum)) {
      return NextResponse.json({ error: `invalid shiftId (not a number): ${String(body.shiftId)}` }, { status: 400 })
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error('[api/shift-reassign] env_not_configured')
      return NextResponse.json({ error: 'env_not_configured' }, { status: 500 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // ★ ここがポイント：text を明示するため空文字を送る（null は使わない）
    const args = {
      p_shift_id: shiftIdNum,          // bigint
      p_from_user_id: body.fromUserId, // text
      p_to_user_id: body.toUserId,     // text
      p_actor_auth_id: '',             // ★ text に寄せる
      p_reason: body.reason ?? 'leave_request_auto',
    }

    console.log('[api/shift-reassign] args', args)

    const { data, error } = await admin.rpc('shift_direct_reassign', args)

    if (error) {
      console.error('[api/shift-reassign] rpc_error', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[api/shift-reassign] ok', data)
    return NextResponse.json({ ok: true, data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api/shift-reassign] exception', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
