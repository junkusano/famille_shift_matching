// lib/lineworks/syncGroupsFromChannelIds.ts

import { createClient } from '@supabase/supabase-js'

const BOT_ID = process.env.WORKS_API_BOT_ID!
const WORKS_API_TOKEN = process.env.WORKS_API_TOKEN!
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

type ChannelInfo = {
  channelId: string
  title: string
  groupId?: string | null
}

async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null> {
  const url = `https://www.worksapis.com/v1.0/bots/${BOT_ID}/channels/${channelId}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${WORKS_API_TOKEN}`,
      },
    })

    if (!res.ok) {
      console.error(`❌ API取得失敗 channelId=${channelId}:`, await res.text())
      return null
    }

    const json = await res.json()
    console.log(`📥 取得成功: channelId=${channelId}, title=${json.title}, groupId=${json.channelType?.groupId}`)

    return {
      channelId: json.channelId,
      title: json.title,
      groupId: json.channelType?.groupId ?? null,
    }
  } catch (e) {
    console.error(`❌ fetchChannelInfo エラー: channelId=${channelId}`, e)
    return null
  }
}

export async function syncGroupsFromChannelIds(): Promise<void> {
  try {
    const { data: logs, error } = await supabase
      .from('msg_lw_log')
      .select('channel_id')
      .not('channel_id', 'is', null)

    if (error) {
      console.error('❌ msg_lw_log取得エラー:', error)
      return
    }

    const uniqueChannelIds = Array.from(new Set(logs.map((l: { channel_id: string }) => l.channel_id)))
    console.log(`📊 チャンネル数: ${uniqueChannelIds.length}`)

    const results: ChannelInfo[] = []

    for (const channelId of uniqueChannelIds) {
      const info = await fetchChannelInfo(channelId)
      if (info) {
        results.push(info)
      }
    }

    const upsertData = results.map((r) => ({
      channel_id: r.channelId,
      group_id: r.groupId,
      title: r.title,
    }))

    const { error: upsertError } = await supabase
      .from('groups_lw_temp')
      .upsert(upsertData, { onConflict: 'channel_id' })

    if (upsertError) {
      console.error('❌ groups_lw_temp upsertエラー:', upsertError)
    } else {
      console.log(`✅ ${upsertData.length}件をgroups_lw_tempにupsert`)
    }
  } catch (e) {
    console.error('❌ syncGroupsFromChannelIds 実行エラー:', e)
  }
}
