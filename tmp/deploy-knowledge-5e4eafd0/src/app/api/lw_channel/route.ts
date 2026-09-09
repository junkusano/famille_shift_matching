// app/api/lw-channel/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service' // ← ここがポイント

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const account = searchParams.get('kaipoke_cs_id')

  if (!account) {
    return NextResponse.json({ error: 'missing kaipoke_cs_id' }, { status: 400 })
  }

  try {
    // RPC関数（get_lw_channel_id）を呼ぶ
    const { data, error } = await supabaseAdmin.rpc('get_lw_channel_id', {
      p_group_account: account,
    })

    if (error) {
      console.error('[lw-channel][rpc error]', error)
      return NextResponse.json({ error: 'rpc failed', detail: error.message }, { status: 500 })
    }

    return NextResponse.json({ channelId: data ?? null }, { status: 200 })
  } catch (e) {
    console.error('[lw-channel][fetch error]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
