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

// camelCase / snake_case どちらも受け取り、型をそろえる
function normalizeBody(v: unknown): Body | null {
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    const body: Body = {
        // ← 文字列・数値の別を問わず String(...) で受ける
        shiftId: String(o.shiftId ?? o.shift_id ?? '').trim(),
        fromUserId: String(o.fromUserId ?? o.from_user_id ?? '').trim(),
        toUserId: String(o.toUserId ?? o.to_user_id ?? '').trim(),
        reason: o.reason === undefined ? undefined : String(o.reason),
    }
    if (!body.shiftId || !body.fromUserId || !body.toUserId) return null
    return body
}

export async function POST(req: Request) {
    try {
        const ct = req.headers.get('content-type') || '';
        const raw = await req.text(); // ★常にテキストで読む
        console.log('[api/shift-reassign] ct=', ct, 'raw.len=', raw.length, 'head=', raw.slice(0, 200));

        let parsed: unknown = null;
        try { parsed = raw ? JSON.parse(raw) : null; }
        catch (e) {
            console.error('[api/shift-reassign] JSON.parse error:', e);
            return NextResponse.json({ error: 'bad_json' }, { status: 400 });
        }

        // 以降は今の normalize → rpc 呼び出しのままでOK
        const body = normalizeBody(parsed);
        if (!body) {
            console.warn('[api/shift-reassign] bad_request parsed=', parsed);
            return NextResponse.json(
                { error: "bad_request: expected 'shiftId|shift_id', 'fromUserId|from_user_id', 'toUserId|to_user_id'" },
                { status: 400 }
            );
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
