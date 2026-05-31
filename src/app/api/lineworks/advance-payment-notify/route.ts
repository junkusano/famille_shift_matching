//api/lineworks/advance-payment-notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      userName,
      applicationDate,
      amount,
      applicationNo,
      baseAmount,
      deductionRate,
      deductionReasons,
      selectedShifts,
    } = body;

    const token = await getAccessToken();

    const message =
      `【日払い申請】
申請者：${userName ?? userId}
申請日：${applicationDate}
申請番号：${applicationNo}

申請額：${Number(amount ?? 0).toLocaleString()}円
対象合計：${Number(baseAmount ?? 0).toLocaleString()}円
控除率：${Math.round(Number(deductionRate ?? 0) * 100)}%
控除理由：${Array.isArray(deductionReasons) ? deductionReasons.join("、") : "-"}

対象シフト：
${Array.isArray(selectedShifts)
        ? selectedShifts.map(
          (
            s: {
              shift_id: number;
              shift_start_date: string;
              shift_start_time: string;
              shift_end_time: string;
              client_name?: string;
            }
          ) =>
            `・${s.shift_start_date} ${String(s.shift_start_time).slice(0, 5)}-${String(s.shift_end_time).slice(0, 5)} ${s.client_name ?? ""} / shift_id:${s.shift_id}`
        ).join("\n")
        : "-"}`;

    const { data: userRoom, error: userRoomError } = await supabaseAdmin
      .from("group_lw_channel_view")
      .select("channel_id")
      .eq("user_id", userId)
      .eq("group_type", "人事労務サポートルーム")
      .maybeSingle();

    if (userRoomError) throw userRoomError;

    const adminChannelId = "99142491";

    const sentTo: string[] = [];

    console.log("[advance-payment-notify] sending", {
      adminChannelId,
      userChannelId: userRoom?.channel_id,
    });

    // ヘルパーマネジャー共有チャネル
    await sendLWBotMessage(adminChannelId, message, token);
    sentTo.push("manager");

    // 申請者の人事労務サポートルーム
    if (userRoom?.channel_id) {
      await sendLWBotMessage(userRoom.channel_id, message, token);
      sentTo.push("user-hr-room");
    }
    if (sentTo.length === 0) {
      throw new Error("送信先LINE WORKS channel_id が見つかりませんでした");
    }

    return NextResponse.json({ ok: true, sentTo });
  } catch (error) {
    console.error("[advance-payment-notify] error", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}