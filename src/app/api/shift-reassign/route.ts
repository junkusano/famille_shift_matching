// /src/app/api/shift-reassign/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

type RpcResult = { ok: boolean } // shift_direct_reassign の返却(jsonb)を想定

function isBody(v: unknown): v is Body {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.shiftId === 'string' &&
    typeof o.fromUserId === 'string' &&
    typeof o.toUserId === 'string' &&
    (o.reason === undefined || typeof o.reason === 'string')
  )
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as unknown
    if (!isBody(payload)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 })
    }
    const { shiftId, fromUserId, toUserId, reason } = payload

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'env_not_configured' }, { status: 500 })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // ★ 型引数は付けない（TS2344回避）
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

    // 任意で安全に型を主張
    const result = data as RpcResult | null

    return NextResponse.json({ ok: true, data: result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown_error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
