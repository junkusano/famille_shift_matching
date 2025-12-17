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

    // 安全対策：空の groupId は登録しない
    if (!groupId) {
        console.warn(`[lw webhook] ⚠️ groupId が空のため upsertGroupAndChannel をスキップ: channelId=${channelId}`);
        return;
    }

    // NOTE:
    // groups_lw は Cron で整備されている前提なので、webhook 側で upsert しない。
    // （DDL上 group_name が NOT NULL のため、ここで group_name を持たずに upsert すると失敗しやすい）
    // ただし「見たことがある group」更新の痕跡として updated_at だけ update しておく。
    const { error: updateGroupError } = await supabaseAdmin
        .from("groups_lw")
        .update({ updated_at: new Date().toISOString() })
        .eq("group_id", groupId);

    if (updateGroupError) {
        console.error("[lw webhook] groups_lw update error", updateGroupError);
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

        // ★重要：隠し部屋（自分）にも primary を保存
        const { error: upsertHiddenPrimaryError } = await supabaseAdmin
            .from("group_lw_channel_info")
            .upsert(
                {
                    group_id: groupId,
                    channel_id: channelId,
                    fetched_at: new Date().toISOString(),
                },
                { onConflict: "channel_id" }
            );

        if (upsertHiddenPrimaryError) {
            console.error(
                "[lw webhook] group_lw_channel_info upsert hidden primary error",
                upsertHiddenPrimaryError
            );
        }

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

// Supabaseからグループ情報取得（primary / secondary 両対応）
async function getGroupInfoFromChannelId(channelId: string) {
    const { data, error } = await supabaseAdmin
        .from('group_lw_channel_info')
        .select('group_id, channel_id, channel_id_secondary')
        .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
        .maybeSingle()

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

        // groupId を確定させる（DBが無ければAPIで補完）
        let resolvedGroupId: string | null = groupInfo?.groupId ?? null

        if (!resolvedGroupId) {
            const apiInfo = await fetchChannelInfo(channelId)
            if (apiInfo) {
                resolvedGroupId = apiInfo.groupId

                // 取得した情報は一旦 temp にも残す（監査/デバッグ用）
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

                // group_lw_channel_info を作る（groupId が取れた場合のみ）
                await upsertGroupChannelInfo(apiInfo.groupId, apiInfo.channelId)

                console.log(`✅ group_lw_channel_info に upsert 完了: ${apiInfo.channelId}`)
            } else {
                console.warn(`⚠️ APIでもグループ情報取得できず: ${channelId}`)
            }
        }

        // ★ここが重要：resolvedGroupId を使って登録する
        if (resolvedGroupId) {
            await upsertGroupAndChannel({
                groupId: resolvedGroupId,
                channelId,
            })
        } else {
            console.warn(`⚠️ resolvedGroupId が null のため upsertGroupAndChannel をスキップ: channelId=${channelId}`)
        }

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

    // すでに存在するか確認（primary / secondary 両対応）
    const { data: existing, error: existingError } = await supabaseAdmin
        .from('group_lw_channel_info')
        .select('id')
        .or(`channel_id.eq.${channelId},channel_id_secondary.eq.${channelId}`)
        .maybeSingle()

    if (existingError) {
        console.error(`❌ group_lw_channel_info 既存確認失敗: ${channelId}`, existingError)
        // 既存確認に失敗しても、重複制約に任せて upsert を試みる
    } else if (existing?.id) {
        console.log(`ℹ️ 既に登録済み: ${channelId}`)
        return
    }

    // 未登録なら upsert
    const { error: upsertError } = await supabaseAdmin
        .from('group_lw_channel_info')
        .upsert(
            {
                group_id: groupId,
                channel_id: channelId,
                fetched_at: new Date().toISOString(),
            },
            { onConflict: 'channel_id' }
        )

    if (upsertError) {
        console.error(`❌ group_lw_channel_info への upsert 失敗: ${channelId}`, upsertError)
    } else {
        console.log(`✅ group_lw_channel_info に upsert 完了: ${channelId}`)
    }
}
