//api/shift-records/unfinish-alert/route.ts
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";  // アクセストークン取得関数をインポート
import { NextRequest, NextResponse } from "next/server";
void NextRequest
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";

// シフト情報を取得し、未対応のシフトに対してメッセージを送信
export async function GET() {
  try {
    const currentTime = new Date();
    
    // シフトデータの取得
    const { data: shifts, error } = await supabase
      .from('shift')
      .select('*')
      .eq('staff_01_user_id', 'junkusano') // 担当者がjunkusano
      .gte('shift_end_date', format(currentTime, 'yyyy-MM-dd'));  // 現在以降のシフト

    if (error) {
      throw error;
    }

    // アクセストークンをlibから取得
    const accessToken = await getAccessToken();

    const sent = new Set(); // 送信済みのchannel_idを管理するためのSet
    for (const shift of shifts) {
      const shiftEndDateTime = new Date(`${shift.shift_end_date}T${shift.shift_end_time}`);

      // シフトの終了時間が過ぎており、未対応（draft）の場合
      if (shiftEndDateTime < currentTime && shift.status === 'draft') {
        const messageText = `${shift.shift_start_date} ${shift.shift_start_time} の記録が未了です。\n未了の記録（赤いボタン：訪問記録）を確認し、完了させてください。`;

        // シフトのchannel_idが存在し、まだ送信していない場合
        if (shift.channel_id && !sent.has(shift.channel_id)) {
          const messageText2 = `<m userId="${shift.lw_userid}">さん\n${messageText}`;
          await sendLWBotMessage(shift.channel_id, messageText2, accessToken);
          sent.add(shift.channel_id); // 送信したchannel_idをセットに追加
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing shifts:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
