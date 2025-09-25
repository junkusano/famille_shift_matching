//api/shift-reassign/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Body = {
    shiftId: string
    fromUserId: string
    toUserId: string
    reason?: string
}

export async function POST(req: Request) {
    try {
        const { shiftId, fromUserId, toUserId, reason } = (await req.json()) as Body
        if (!shiftId || !fromUserId || !toUserId) {
            return NextResponse.json({ error: 'bad_request' }, { status: 400 })
        }

        const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )

        const { data, error } = await admin.rpc('shift_direct_reassign', {
            p_shift_id: shiftId,
            p_from_user_id: fromUserId,
            p_to_user_id: toUserId,
            p_actor_auth_id: null,
            p_reason: reason ?? 'leave_request_auto',
        })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ ok: true, data })
    } catch (e: any) {
        return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
    }
}
