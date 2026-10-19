import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { HELPER_MANAGER_CHANNEL_ID } from "@/lib/lineworks/managerChannel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      applicantName,
      shiftId,
      shiftStartDate,
      shiftStartTime,
      shiftEndTime,
      clientName,
      failureReason,
    } = body ?? {};

    if (!shiftId || !shiftStartDate || !clientName) {
      return NextResponse.json({ error: "シフト情報が不足しています" }, { status: 400 });
    }

    const message = [
      "【要対応：シフ子の通知失敗】",
      "申請者のシフト反映・申請登録は完了していますが、利用者グループへのLINE WORKS通知に失敗しました。",
      "元の通知が遅れて届く可能性もあるため、重複送信に注意して確認してください。",
      "",
      `申請者：${applicantName || "不明"}`,
      `シフトID：${shiftId}`,
      `日付：${shiftStartDate}`,
      `時間：${shiftStartTime || "不明"}～${shiftEndTime || "不明"}`,
      `利用者：${clientName}`,
      `原因：${failureReason || "通知処理のタイムアウトまたは送信失敗"}`,
    ].join("\n");

    const accessToken = await getAccessToken();
    await sendLWBotMessage(HELPER_MANAGER_CHANNEL_ID, message, accessToken);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[shift-coordinate-notification-alert] error", error);
    return NextResponse.json({ error: "ヘルパーマネジャー通知に失敗しました" }, { status: 500 });
  }
}
