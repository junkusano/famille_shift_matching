import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Group = {
  id: string
  name: string
  channelId: string
}

type GroupApiResponse = {
  groups: Group[]
}

// LINE WORKS Botトークンを使ってグループ一覧を取得し、channelIdに一致するグループを探す
async function getGroupInfoFromChannelId(channelId: string): Promise<{
  groupId: string
  groupName: string
  channelId: string
} | null> {
  try {
    const response = await fetch('https://www.worksapis.com/v1.0/groups', {
      headers: {
        Authorization: `Bearer ${process.env.LW_BOT_TOKEN!}`,
        'Content-Type': 'application/json',
      },
    })
    const json: GroupApiResponse = await response.json()

    const group = json.groups.find((g) => g.channelId === channelId)
    if (!group) {
      console.log(`⚠️ group not found for channelId: ${channelId}`)
      return null
    }

    return {
      groupId: group.id,
      groupName: group.name,
      channelId: group.channelId,
    }
  } catch (err) {
    console.error('❌ グループ取得エラー:', err)
    return null
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

    const { error: logError } = await supabase.from('msg_lw_log').insert([
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

    if (logError) {
      console.error('❌ Supabase保存エラー (msg_lw_log):', logError)
      return NextResponse.json({ error: 'log db error' }, { status: 500 })
    }

    const groupInfo = await getGroupInfoFromChannelId(channelId)

    if (groupInfo) {
      const { error: groupError } = await supabase
        .from('groups_lw_temp')
        .upsert(
          [
            {
              group_id: groupInfo.groupId,
              group_name: groupInfo.groupName,
              channel_id: groupInfo.channelId,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'channel_id' }
        )

      if (groupError) {
        console.error('❌ Supabase保存エラー (groups_lw_temp):', groupError)
        return NextResponse.json({ error: 'group db error' }, { status: 500 })
      }

      console.log(`✅ groups_lw_temp に upsert 完了: ${groupInfo.groupName}`)
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err) {
    console.error('❌ エラー:', err)
    return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
  }
}
