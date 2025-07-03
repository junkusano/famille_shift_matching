import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/getAccessToken'

// Supabase接続情報
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const BOT_ID = process.env.WORKS_API_BOT_ID!

type ChannelInfo = {
  channelId: string
  title: string
  groupId?: string | null
}

// チャンネル情報をAPIから取得
async function fetchChannelInfo(channelId: string): Promise<ChannelInfo | null> {
  const accessToken = await getAccessToken()
  const url = `https://www.worksapis.com/v1.0/bots/${BOT_ID}/channels/${channelId}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!res.ok) {
    console.error(`❌ API取得失敗 channelId=${channelId}`, await res.text())
    return null
  }

  const json = await res.json()
  const groupId = json.channelType?.groupId ?? null

  console.log(`📥 チャンネル取得: ${channelId}, title=${json.title}, groupId=${groupId}`)

  return {
    channelId: json.channelId,
    title: json.title,
    groupId,
  }
}

// groups_lw_tempへ一括同期
export async function syncGroupsFromChannelIds() {
  const { data: logs, error: fetchError } = await supabase
    .from('msg_lw_log')
    .select('channel_id')
    .not('channel_id', 'is', null)

  if (fetchError) {
    console.error('❌ msg_lw_log取得エラー:', fetchError)
    return
  }

  const uniqueChannelIds = Array.from(new Set(logs.map((l: { channel_id: string }) => l.channel_id)))
  console.log(`🔍 チャンネルID数: ${uniqueChannelIds.length}`)

  const results: ChannelInfo[] = []

  for (const channelId of uniqueChannelIds) {
    try {
      const info = await fetchChannelInfo(channelId)
      if (info) results.push(info)
    } catch (e) {
      console.error(`❌ fetchChannelInfo失敗: channelId=${channelId}`, e)
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
}
