//"C:\Users\USER\famille_shift_matching\src\app\api\webhook\route.ts"
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/getAccessToken'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

//const BOT_ID = process.env.LW_BOT_ID!
//const BOT_ID = "6807147";
const BOT_ID = "6807751";   //ヘルパーサービス管理者

async function upsertGroupAndChannel(params: {
    groupId: string;
    channelId: string;
}) {
    const { groupId, channelId } = params;

    // 1) groups_lw を upsert（ここは今まで通りの処理に合わせてください）
    const { error: upsertGroupError } = await supabaseAdmin
        .from("groups_lw")
        .upsert(
            {
                group_id: groupId,
                //group_name: groupName,
                // group_name から group_account / group_account_secondary を
                // saveGroupsTemp.ts 側で分解しているなら、そこに合わせてもOK。
                // ここでは最低限 group_id / group_name だけでもよい想定。
                updated_at: new Date().toISOString(),
            },
            { onConflict: "group_id" }
        );

    if (upsertGroupError) {
        console.error("[lw webhook] groups_lw upsert error", upsertGroupError);
        // ここは必要に応じて return するかどうか判断
    }

    // 2) この group_id の group_account を取得
    const { data: thisGroup, error: thisGroupError } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id, group_account")
        .eq("group_id", groupId)
        .maybeSingle();

    if (thisGroupError) {
        console.error("[lw webhook] groups_lw select error", thisGroupError);
    }

    // group_account が取れなければ、従来通りの処理
    if (!thisGroup || !thisGroup.group_account) {
        await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: groupId,
                    channel_id: channelId,
                    fetched_at: new Date().toISOString(),
                },
                { onConflict: "channel_id" }
            );
        return;
    }

    const myAccount: string = thisGroup.group_account;

    // 3) 「自分の group_account を group_account_secondary として持つグループ」
    //    → これを「メイングループ」とみなす
    const { data: parentGroup, error: parentGroupError } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id")
        .eq("group_account_secondary", myAccount)
        .maybeSingle();

    if (parentGroupError) {
        console.error("[lw webhook] groups_lw select parent error", parentGroupError);
    }

    if (parentGroup?.group_id) {
        // === 隠し部屋パターン ===
        // parentGroup.group_id が「同居メイン側の group_id」

        const parentGroupId = parentGroup.group_id;

        // parentGroupId のレコードに channel_id_secondary を設定する
        const { error: upsertSecondaryError } = await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: parentGroupId,
                    channel_id_secondary: channelId,
                    fetched_at: new Date().toISOString(),
                },
                {
                    // channel_id_secondary はユニーク制約をつけているので onConflict で指定可能
                    onConflict: "channel_id_secondary",
                }
            );

        if (upsertSecondaryError) {
            console.error(
                "[lw webhook] group_lw_channel_info upsert secondary error",
                upsertSecondaryError
            );
        }

        // 隠し部屋側の group_id には、あえて channel 情報を登録しない。
        // （もし登録したい運用があるなら、ここで別途 upsert すればOK）
        return;
    }

    // === 通常パターン ===
    // 自分を secondary として見ているグループがなければ、今まで通り自分の group_id で登録
    const { error: upsertPrimaryError } = await supabaseAdmin
        .from("group_lw_channel_info")
        .upsert(
            {
                group_id: groupId,
                channel_id: channelId,
                fetched_at: new Date().toISOString(),
            },
            { onConflict: "channel_id" }
        );

    if (upsertPrimaryError) {
        console.error(
            "[lw webhook] group_lw_channel_info upsert primary error",
            upsertPrimaryError
        );
    }
}

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
        .from('group_lw_channel_info')
        .select('group_id, channel_id')
        .eq('channel_id', channelId)
        .single()

    if (error || !data) {
        console.warn(`⚠️ DBにグループ情報なし: ${channelId}`)
        return null
    }

    return {
        groupId: data.group_id,
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
                status: 0,
            },
        ])

        const groupInfo = await getGroupInfoFromChannelId(channelId)

        // グループ情報がなければAPIから取得
        if (!groupInfo) {
            const apiInfo = await fetchChannelInfo(channelId)
            if (apiInfo) {
                await supabase.from('group_lw_temp').upsert(
                    [
                        {
                            group_id: apiInfo.groupId,
                            channel_id: apiInfo.channelId,
                            fetched_at: new Date().toISOString(),
                        },
                    ],
                    { onConflict: 'channel_id' }
                )

                // group_lw_channel_infoにも登録（存在しない場合のみ）
                await upsertGroupChannelInfo(apiInfo.groupId, apiInfo.channelId)

                console.log(`✅ groups_lw_channel_info に upsert 完了: ${apiInfo.channelId}`)




            } else {
                console.warn(`⚠️ グループ情報取得できず: ${channelId}`)
            }
        }


        await upsertGroupAndChannel({
            groupId: groupInfo?.groupId || '',
            channelId,
        })

        return NextResponse.json({ status: 'ok' }, { status: 200 })
    } catch (err) {
        console.error('❌ エラー:', err)
        return NextResponse.json({ error: 'unexpected error' }, { status: 500 })
    }
}

// group_lw_channel_infoに存在しなければ登録
async function upsertGroupChannelInfo(groupId: string | null, channelId: string) {
    if (!groupId) {
        console.warn(`⚠️ groupId が null のため、登録スキップ: ${channelId}`)
        return
    }

    // すでに存在するか確認
    const { data } = await supabase
        .from('group_lw_channel_info')
        .select('id')
        .eq('channel_id', channelId)
        .single()

    if (data) {
        console.log(`ℹ️ 既に登録済み: ${channelId}`)
        return
    }

    // 未登録なら追加
    const { error: insertError } = await supabase.from('group_lw_channel_info').insert([
        {
            group_id: groupId,
            channel_id: channelId,
            fetched_at: new Date().toISOString(),
        },
    ])

    if (insertError) {
        console.error(`❌ group_lw_channel_info への登録失敗: ${channelId}`, insertError)
    } else {
        console.log(`✅ group_lw_channel_info に登録完了: ${channelId}`)
    }
}

