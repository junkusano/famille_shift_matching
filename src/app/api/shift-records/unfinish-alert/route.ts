//api/shift-records/unfinished-alert/route.ts
// 未了シフトの担当者へのリマインドメッセージ送信 (cronジョブ用)
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { format, subHours } from "date-fns";

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
      .not('status', 'in', ['removed_from_lineworks_kaipoke', 'inactive']);

    if (usersError) throw usersError;

    // 2. 全利用者（Client）リストとそのチャンネルIDを取得
    // 利用者名と、利用者ごとのLineWorksチャンネルIDを取得
    const { data: clientList, error: clientError } = await supabase
      .from('cs_kaipoke_info')
      .select('kaipoke_cs_id, name, group_lw_channel_view(channel_id)');

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
      .or(`status.eq.draft,status.is.null`)  // statusがdraftかnullのシフト
      .lte('shift_end_date', endTimeLimitDate) // 終了日が指定日時以下
      .lte('shift_end_time', endTimeLimitTime); // 終了時間が指定日時以下

    if (shiftError) throw shiftError;

    // --- (A) 担当者（User）ループ (外側) ---
    for (const user of usersData) {
      const userId = user.user_id;

      // テスト用ユーザー制限
      if (user.user_id !== 'junkusano') {
        continue; // テスト用ユーザー以外はスキップ
      }

      // --- (B) 利用者（Client）ループ (内側) ---
      for (const client of clientList) {
        const kaipokeCsId = client.kaipoke_cs_id;

        // 利用者のLwチャットルームID
        const clientChannelId = client.group_lw_channel_view?.[0]?.channel_id;

        if (!clientChannelId) {
          // 利用者のLwチャンネルが未設定の場合はスキップ
          continue;
        }

        // 4. 担当者 かつ 利用者 に絞った未了シフトを取得
        const unfinishedShifts = shifts.filter(shift => {
          return (shift.staff_01_user_id === userId || shift.staff_02_user_id === userId || shift.staff_03_user_id === userId)
            && shift.kaipoke_cs_id === kaipokeCsId;
        });

        const clientUnfinishedShifts: string[] = [];

        // 5. 未了判定とメッセージ作成
        for (const shift of unfinishedShifts) {
          // shift_end_date が null の場合は shift_start_date を使用
          const endDateString = shift.shift_end_date || shift.shift_start_date;
                    
          if (!endDateString || !shift.shift_end_time) {
            // 日付情報がないシフトはスキップ (データ不備として)
            continue;
          }

          // 終了日時を正確に計算
          const shiftEndDateTime = new Date(`${endDateString}T${shift.shift_end_time}`);

          // 未了（未対応）の判定ロジック:
          // 終了時刻が1時間以上過ぎている AND (記録がない OR ステータスが 'draft')
          const isUnrecorded = (
            shift.record_status === null || 
            shift.record_status === 'draft'
          );

          if (shiftEndDateTime < oneHourAgo && isUnrecorded) {
            // メッセージに追加: 日時と未了である旨
            clientUnfinishedShifts.push(
              `・${shift.shift_start_date} ${shift.shift_start_time} - ${shift.shift_end_time}`
            );
          }
        }

        // 6. 利用者ごとの未了シフトが見つかった場合、メッセージキューに追加
        if (clientUnfinishedShifts.length > 0) {
          const header = `${client.name} 様の訪問記録が未了です。`;
          const body = clientUnfinishedShifts.join('\n');

          // 現在の日付を取得（現在が該当月かどうかを判断）
          const currentMonth = format(currentTime, 'yyyy-MM');
          const shiftDate = clientUnfinishedShifts[0].split(' ')[0]; // シフトの日付を取得（`yyyy/mm/dd`）

          // 該当日が今月でなければ、リンクに `date=その月の1日` を追加
          let link = `https://myfamille.shi-on.net/portal/shift-view`;
          if (!shiftDate.startsWith(currentMonth)) {
            link += `?date=${shiftDate.substring(0, 7)}-01`;
          }

          // LineWorksで担当者へメンション
          const messageSegment = `\n\n<m userId="${userId}">さん\n${header}\n${body}\n\n未了の記録（赤いボタン：訪問記録）を確認し、完了させてください。\n${link}`;

          // 利用者チャンネルID（Bot送信先）にメッセージを追記
          const currentMessage = clientMessageQueue.get(clientChannelId) || 
                                 `【未了訪問記録の通知】\n`;
          clientMessageQueue.set(clientChannelId, currentMessage + messageSegment);
        }
      }
    } // End of User loop

    // 7. メッセージの送信
    console.log(`Sending ${clientMessageQueue.size} messages to client channels...`);

    for (const [channelId, message] of clientMessageQueue.entries()) {
      await sendLWBotMessage(channelId, message, accessToken);
    }

    console.log("--- Unfinished Shift Alert Cron Job Finished Successfully ---");
    return NextResponse.json({ success: true, count: clientMessageQueue.size });
  } catch (error) {
    console.error("Error processing shifts:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
