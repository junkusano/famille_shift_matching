import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/getAccessToken'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

//const BOT_ID = process.env.LW_BOT_ID!
const BOT_ID = "6807147";

// チャンネル情報をAPIから取得
async function fetchChannelInfo(channelId: string): Promise<{
  channelId: string
  title: string
  groupId: string | null
} | null> {
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

// Supabaseからグループ情報取得
async function getGroupInfoFromChannelId(channelId: string) {
  const { data, error } = await supabase
    .from('groups_lw_temp')
    .select('group_id, group_name, channel_id')
    .eq('channel_id', channelId)
    .single()

  if (error || !data) {
    console.warn(`⚠️ DBにグループ情報なし: ${channelId}`)
    return null
  }

  return {
    groupId: data.group_id,
    groupName: data.group_name,
    channelId: data.channel_id,
  }
}

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

    await supabase.from('msg_lw_log').insert([
      {
        event_type: eventType,
        timestamp,
        user_id: userId,
        channel_id: channelId,
        domain_id: domainId,
        message,
        file_id: fileId,
        members,
        status: '未判定',
      },
    ])

    const groupInfo = await getGroupInfoFromChannelId(channelId)

    // グループ情報がなければAPIから取得
    if (!groupInfo) {
      const apiInfo = await fetchChannelInfo(channelId)
      if (apiInfo) {
        await supabase.from('groups_lw_temp').upsert(
          [
            {
              group_id: apiInfo.groupId,
              group_name: apiInfo.title,
              channel_id: apiInfo.channelId,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'channel_id' }
        )

        console.log(`✅ groups_lw_temp に upsert 完了: ${apiInfo.title}`)
      } else {
        console.warn(`⚠️ グループ情報取得できず: ${channelId}`)
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err) {
    console.error('❌ エラー:', err)
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
