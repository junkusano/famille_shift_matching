import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()

    const eventType = data?.type || null
    const timestamp = data?.issuedTime || new Date().toISOString()
    const userId = data?.source?.userId || null
    const channelId = data?.source?.channelId || null
    const domainId = String(data?.source?.domainId || '')
    const message = data?.content?.text || null
    const fileId = data?.content?.fileId || null
    const members = eventType === 'joined' ? data?.members || null : null

    if (!eventType || !channelId || !domainId) {
      console.log('⚠️ 必須フィールド不足：スキップ')
      return NextResponse.json({ status: 'skipped' }, { status: 200 })
    }

    const { error } = await supabase.from('msg_lw_log').insert([{
      event_type: eventType,
      timestamp,
      user_id: userId,
      channel_id: channelId,
      domain_id: domainId,
      message,
      file_id: fileId,
      members,
      status: '未判定'
    }])

    if (error) {
      console.error('❌ Supabase保存エラー:', error)
      return NextResponse.json({ error: 'db error' }, { status: 500 })
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err) {
    console.error('❌ エラー:', err)
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
