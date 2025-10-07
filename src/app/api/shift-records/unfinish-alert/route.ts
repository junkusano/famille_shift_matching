//api/shift-records/unfinish-alert/route.ts
import { supabase } from "@/lib/supabaseClient";
import { NextApiRequest, NextApiResponse } from "next";
import { format } from "date-fns";

const testUserId = "junkusano";  // テスト用のユーザーID

async function sendAlertToLineWorks(channelId: string, message: string) {
  try {
    const res = await fetch(`https://api.lineworksapis.com/v1.0/bots/{botNo}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer {your_bot_access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
      }),
    });

    if (!res.ok) {
      throw new Error(`LINE WORKS Botへのメッセージ送信に失敗しました: ${res.statusText}`);
    }
  } catch (error) {
    console.error("LINE WORKSへのアラート送信エラー: ", error);
  }
}

// ここで、`GET`と`POST`などのHTTPメソッドをエクスポートします
export async function GET(_req: NextApiRequest, res: NextApiResponse) {
  try {
    // シフトデータの取得処理
    const { data: shifts, error } = await supabase
      .from('shift')
      .select('*')
      .gte('shift_end_date', format(new Date(), 'yyyy-MM-dd'));

    if (error) {
      throw error;
    }

    // シフトを1つずつチェック
    for (const shift of shifts) {
      const shiftEndDateTime = new Date(`${shift.shift_end_date}T${shift.shift_end_time}`);
      const currentTime = new Date();

      if (shiftEndDateTime < currentTime && (!shift.shift_id || shift.status === 'draft')) {
        const userChannelId = "f29a1715-fd08-bc51-98ac-ac0e6c5d0b61";
        const message = `<mention id="${testUserId}"/> さん ${shift.shift_start_date} ${shift.shift_start_time} の記録が未了です。\n未了の記録（赤いボタン：訪問記録）を確認し、完了させてください。`;

        // LINE WORKSにアラートを送信
        await sendAlertToLineWorks(userChannelId, message);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("シフトの取得または処理エラー: ", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
