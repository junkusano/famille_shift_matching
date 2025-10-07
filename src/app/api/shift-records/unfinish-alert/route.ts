//api/shift-records/unfinish-alert/route.ts
import { NextRequest, NextResponse } from "next/server";
void NextRequest
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";

// Botのアクセストークンを取得する関数
async function getBotAccessToken() {
  const response = await fetch('https://api.lineworksapis.com/v1.0/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'grant_type': 'client_credentials',
      'client_id': '{YOUR_CLIENT_ID}',  // BotのClient ID
      'client_secret': '{YOUR_CLIENT_SECRET}'  // BotのClient Secret
    }),
  });

  const data = await response.json();
  return data.access_token;
}

// シフトが超過していて、未対応のシフトがある場合にメッセージを送信する関数
async function sendUnfinishedShiftAlert(shift, accessToken) {
  const userChannelId = "f29a1715-fd08-bc51-98ac-ac0e6c5d0b61";  // チャンネルID
  const message = `<mention id="junkusano"/> さん ${shift.shift_start_date} ${shift.shift_start_time} の記録が未了です。\n未了の記録（赤いボタン：訪問記録）を確認し、完了させてください。`;

  try {
    const res = await fetch(`https://api.lineworksapis.com/v1.0/bots/{botNo}/channels/${userChannelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to send message: ${res.statusText}`);
    }
    console.log("Message sent successfully!");
  } catch (error) {
    console.error("Error sending message to LineWorks:", error);
  }
}

// GETリクエストに対応するAPIルート
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

    // Botのアクセストークンを取得
    const accessToken = await getBotAccessToken();

    // シフトを1つずつチェック
    for (const shift of shifts) {
      const shiftEndDateTime = new Date(`${shift.shift_end_date}T${shift.shift_end_time}`);

      // シフトの終了時間が過ぎており、未対応（draft）の場合
      if (shiftEndDateTime < currentTime && shift.status === 'draft') {
        // Botメッセージを送信
        await sendUnfinishedShiftAlert(shift, accessToken);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing shifts:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
