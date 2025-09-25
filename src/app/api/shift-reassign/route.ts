// /src/app/api/shift-reassign/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Body = {
  shiftId: string
  fromUserId: string
  toUserId: string
  reason?: string
}

type RpcArgs = {
  p_shift_id: string
  p_from_user_id: string
  p_to_user_id: string
  p_actor_auth_id: string | null
  p_reason: string
}

// 生コンテンツから安全に JSON を読む（Content-Type 不問）
async function readJsonAny(req: Request): Promise<unknown> {
  const ct = req.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) return await req.json()
    const raw = await req.text()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// camelCase / snake_case どちらも受け取り、型をそろえる
function normalizeBody(v: unknown): Body | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const shiftId = (o.shiftId ?? o.shift_id) as unknown
  const fromUserId = (o.fromUserId ?? o.from_user_id) as unknown
  const toUserId = (o.toUserId ?? o.to_user_id) as unknown
  const reason = (o.reason ?? o.note ?? o.why) as unknown

  const s = (x: unknown) => (typeof x === 'string' ? x : undefined)

  const b: Body = {
    shiftId: s(shiftId) ?? '',
    fromUserId: s(fromUserId) ?? '',
    toUserId: s(toUserId) ?? '',
    reason: reason === undefined ? undefined : String(reason),
  }

  if (!b.shiftId || !b.fromUserId || !b.toUserId) return null
  return b
}

export async function POST(req: Request) {
  try {
    const payloadRaw = await readJsonAny(req)
    const body = normalizeBody(payloadRaw)

    if (!body) {
      // 何が足りなかったかを返してデバッグしやすく
      return NextResponse.json(
        {
          error: 'bad_request',
          expected: ['shiftId OR shift_id', 'fromUserId OR from_user_id', 'toUserId OR to_user_id'],
        },
        { status: 400 }
      )
    }

    const { shiftId, fromUserId, toUserId, reason } = body

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'env_not_configured' }, { status: 500 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // 型引数は付けず、引数オブジェクトのみ型主張（TS2344回避）
    const { data, error } = await admin.rpc('shift_direct_reassign', {
      p_shift_id: shiftId,
      p_from_user_id: fromUserId,
      p_to_user_id: toUserId,
      p_actor_auth_id: null,
      p_reason: reason ?? 'leave_request_auto',
    } as RpcArgs)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
