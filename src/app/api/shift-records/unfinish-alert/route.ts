//api/shift-records/unfinished-alert/route.ts
// 未了シフトの担当者へのリマインドメッセージ送信 (cronジョブ用)
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { format, subHours } from "date-fns";
//import moment from 'moment-timezone';


// シフト情報を取得し、未対応のシフトに対してメッセージを送信
export async function GET() {
    console.log("--- Unfinished Shift Alert Cron Job Started ---");

    try {
        const currentTime = new Date();
        // 現在時刻から1時間前を計算
        const oneHourAgo = subHours(currentTime, 1);
        const endTimeLimitDate = format(oneHourAgo, 'yyyy-MM-dd');
        const endTimeLimitTime = format(oneHourAgo, 'HH:mm:ss');

        // 1. 全担当者（User）リストを取得
        // statusが除外条件に合わない user_id と channel_id (人事労務サポートルーム) を取得
        const { data: usersData, error: usersError } = await supabase
            .from('user_entry_united_view_single')
            .select('user_id, channel_id')
            .neq('status', 'removed_from_lineworks_kaipoke')
            .neq('status', 'inactive');

        if (usersError) throw usersError;

        // 2. 全利用者（Client）リストとそのチャンネルIDを取得
        // 利用者名と、利用者ごとのLineWorksチャンネルIDを取得
        const { data: clientList, error: clientError } = await supabase
            .from('group_lw_channel_view')
            .select('group_account, channel_id')
            // ★ 修正: group_type が '利用者様情報連携グループ' のものに限定
            .eq('group_type', '利用者様情報連携グループ');

        if (clientError) throw clientError;

        if (clientList.length === 0) {
            console.log("No clients found. Exiting.");
            return NextResponse.json({ success: true, message: "No clients found" });
        }

        // 送信するメッセージを格納する Map
        // Key: 利用者チャンネルID (Bot送信先), Value: メッセージ本文
        const clientMessageQueue = new Map<string, string>();

        const accessToken = await getAccessToken();

        // 3. シフト情報を先にフィルタリングして取得 (statusがdraftまたはnullのもの、1時間前のシフト)
        const { data: shifts, error: shiftError } = await supabase
            .from('shift_shift_record_view') // shift_shift_record_view を使って一発で取得
            .select('*')
            .or(`record_status.eq.draft,record_status.is.null`)  // statusがdraftかnullのシフト
            .lte('shift_start_date', endTimeLimitDate) // 終了日が指定日時以下
            .lte('shift_end_time', endTimeLimitTime); // 終了時間が指定日時以下

        if (shiftError) throw shiftError;

        console.log("取得したシフトデータ:", shifts); // ここで取得したシフトデータの詳細を出力


        // --- (A) 担当者（User）ループ (外側) ---
        for (const user of usersData) {
            const userId = user.user_id;

            // テスト用ユーザー制限
            if (user.user_id !== 'junkusano') {
                continue; // テスト用ユーザー以外はスキップ
            }

            console.log(`[DEBUG] : ${userId} ('junkusano')`);

            // --- (B) 利用者（Client）ループ (内側) ---
            for (const client of clientList) {
                const kaipokeCsId = client.group_account;


                    const clientChannelId = client.channel_id;

                    if (!clientChannelId) {
                        continue;
                    }

                    // 担当者IDと利用者IDに絞って未了シフトを取得
                    const unfinishedShifts = shifts.filter(shift => {
                        return (shift.staff_01_user_id === userId || shift.staff_02_user_id === userId || shift.staff_03_user_id === userId)
                            && shift.kaipoke_cs_id === kaipokeCsId;
                    });

                    const clientUnfinishedShifts: string[] = unfinishedShifts.map(shift =>
                        `・${shift.shift_start_date} ${shift.shift_start_time} - ${shift.shift_end_time}`
                    );

                    if (clientUnfinishedShifts.length > 0) {
                        const header = `訪問記録が未了です。`;
                        const body = clientUnfinishedShifts.join('\n');
                        const link = `https://myfamille.shi-on.net/portal/shift-view`;

                        const messageSegment = `\n\n<m userId="${userId}">さん\n${header}\n${body}\n未了の記録を確認し、完了させてください。\n${link}`;

                        const currentMessage = clientMessageQueue.get(clientChannelId) || `【未了訪問記録の通知】\n`;
                        clientMessageQueue.set(clientChannelId, currentMessage + messageSegment);
                    
                }

            }
            // 7. メッセージの送信
            console.log(`Sending ${clientMessageQueue.size} messages to client channels...`);

            for (const [channelId, message] of clientMessageQueue.entries()) {
                await sendLWBotMessage(channelId, message, accessToken);
            }
        }
        console.log("--- Unfinished Shift Alert Cron Job Finished Successfully ---");
        return NextResponse.json({ success: true, count: clientMessageQueue.size });
    } catch (error) {
        console.error("Error processing shifts:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
