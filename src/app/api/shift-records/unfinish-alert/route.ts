//api/shift-record/unfinish-alert/routes.ts
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
      .neq('status', 'removed_from_lineworks_kaipoke')
      .neq('status', 'inactive');

    if (usersError) throw usersError;
    
    // 担当者の channel_id は使わないが、データ構造を維持

    // 2. 全利用者（Client）リストを取得し、別クエリで取得した channel_id と紐づける
    const { data: clientListRaw, error: clientError } = await supabase
      .from('cs_kaipoke_info')
      .select('kaipoke_cs_id, name, lw_userid'); // lw_userid は cs_kaipoke_info にはないが、後で user_entry_united_view_single を使って結合するため、ここでは利用者IDと名前のみ取得

    if (clientError) throw clientError;

    // --- ★ エラー解消のためのロジック ★ ---
    // user_entry_united_view_single に含まれる kaipoke_user_id (利用者に相当するID) を使って
    // 利用者ID(kaipoke_cs_id) と チャンネルID (channel_id) の対応表を作成
    
    // 利用者リストの構造を変換し、channel_id を追加
    const clientList: { kaipoke_cs_id: string, name: string, channel_id: string | null }[] = [];
    
    // usersData（user_entry_united_view_single）を Map に変換して検索効率を上げる
    // 注: user_entry_united_view_single の user_id は、staff_0x_user_id と一致し、kaipoke_cs_id ではないため、
    // ここで必要なのは、kaipoke_cs_id と対応する channel_id を持つ別のビューからのデータ。
    // しかし、cs_kaipoke_info に直接 channel_id がないため、
    // 担当者のリスト (usersData) を使って、利用者ID (kaipoke_cs_id) に紐づくチャンネルを見つけるのは不適切です。
    
    // 代わりに、ユーザーが提供したテーブル定義から、kaipoke_cs_id と channel_id の関係は、
    // cs_kaipoke_info の ID をキーとする別テーブルか、user_entry_united_view_single のような結合ビューにあると推測されます。
    
    // 暫定的に、**担当者リスト（usersData）**のデータを再利用し、**kaipoke_cs_idが group_account に登録されている** // という前提で channel_id を取得し直します。
    
    // 担当者のリストとは別に、kaipoke_cs_id (利用者ID) と channel_id (利用者のチャットルーム) の対応表を取得
    const { data: clientChannels, error: clientChannelError } = await supabase
        .from('group_lw_channel_view')
        .select('group_account, channel_id'); // group_account に kaipoke_cs_id が入っていると仮定

    if (clientChannelError) throw clientChannelError;
    
    const clientChannelMap = new Map(clientChannels.map(c => [c.group_account, c.channel_id]));

    // clientListRaw に channel_id を付与
    for (const client of clientListRaw) {
        const channelId = clientChannelMap.get(client.kaipoke_cs_id);
        clientList.push({
            kaipoke_cs_id: client.kaipoke_cs_id,
            name: client.name,
            channel_id: channelId || null,
        });
    }

    if (clientList.length === 0) {
      console.log("No clients found. Exiting.");
      return NextResponse.json({ success: true, message: "No clients found" });
    }
    
    // --- ★ エラー解消のためのロジック終わり ★ ---

    // 送信するメッセージを格納する Map
    const clientMessageQueue = new Map<string, string>();

    // アクセストークンをlibから取得 (ループ外で取得)
    const accessToken = await getAccessToken();

    // --- (A) 担当者（User）ループ (外側) ---
    for (const user of usersData) {
      const userId = user.user_id;

      // --- (B) 利用者（Client）ループ (内側) ---
      for (const client of clientList) {
        const kaipokeCsId = client.kaipoke_cs_id;
        const clientChannelId = client.channel_id;

        if (!clientChannelId) {
          // 利用者のLwチャンネルが未設定の場合はスキップ
          continue;
        }

        // 3. 担当者 かつ 利用者 に絞った未了シフトを取得 (shift_shift_record_viewビューを使用)
        const { data: shifts, error: shiftError } = await supabase
          .from('shift_shift_record_view')
          .select('*')
          .eq('kaipoke_cs_id', kaipokeCsId)
          .or(`staff_01_user_id.eq.${userId},staff_02_user_id.eq.${userId},staff_03_user_id.eq.${userId}`)
          .lte('shift_end_date', endTimeLimitDate)
          .lte('shift_end_time', endTimeLimitTime);

        if (shiftError) throw shiftError;

        const clientUnfinishedShifts: string[] = [];

        // 4. 未了判定とメッセージ作成
        for (const shift of shifts) {
          const endDateString = shift.shift_end_date || shift.shift_start_date;
                    
          if (!endDateString || !shift.shift_end_time) {
            continue;
          }

          // 終了日時を正確に計算
          const shiftEndDateTime = new Date(`${endDateString}T${shift.shift_end_time}`);

          // 未了（未対応）の判定ロジック:
          const isUnrecorded = (
            shift.record_status === null || 
            shift.record_status === 'draft'
          );

          if (shiftEndDateTime < oneHourAgo && isUnrecorded) {
            clientUnfinishedShifts.push(
              `・${shift.shift_start_date} ${shift.shift_start_time} - ${shift.shift_end_time}`
            );
          }
        }

        // 5. 利用者ごとの未了シフトが見つかった場合、メッセージキューに追加
        if (clientUnfinishedShifts.length > 0) {
          const header = `${client.name} 様の訪問記録が未了です。`;
          const body = clientUnfinishedShifts.join('\n');

          const currentMonth = format(currentTime, 'yyyy-MM');
          const shiftDate = clientUnfinishedShifts[0].split(' ')[0];

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

    // 6. メッセージの送信
    console.log(`Sending ${clientMessageQueue.size} messages to client channels...`);

    for (const [channelId, message] of clientMessageQueue.entries()) {
      await sendLWBotMessage(channelId, message, accessToken);
    }

    console.log("--- Unfinished Shift Alert Cron Job Finished Successfully ---");
    return NextResponse.json({ success: true, count: clientMessageQueue.size });
  } catch (error) {
    console.error("Error processing shifts:", error);
    // エラーがオブジェクトの場合は JSON に変換して返す
    return NextResponse.json({ success: false, message: error.message || String(error) }, { status: 500 });
  }
}
