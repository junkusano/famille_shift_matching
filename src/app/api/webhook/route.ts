import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Supabaseクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed')

  try {
    const data = req.body

    const eventType = data?.type || null
    const timestamp = data?.issuedTime || new Date().toISOString()
    const userId = data?.source?.userId || null
    const channelId = data?.source?.channelId || null
    const domainId = String(data?.source?.domainId || '')
    const message = data?.content?.text || null
    const fileId = data?.content?.fileId || null
    const members = eventType === 'joined' ? data?.members || null : null

    if (!eventType || !channelId || !domainId) {
      console.log('⚠️ 必須フィールド不足：ログ記録スキップ')
      return res.status(200).send('OK (Skipped)')
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
      return res.status(500).json({ error: 'DB Error' })
    }

    console.log(`✅ ログ保存完了: ${eventType} @ ${channelId}`)
    return res.status(200).send('OK')
  } catch (err) {
    console.error('❌ ハンドラ例外:', err)
    return res.status(500).json({ error: 'Unexpected error' })
  }
}
