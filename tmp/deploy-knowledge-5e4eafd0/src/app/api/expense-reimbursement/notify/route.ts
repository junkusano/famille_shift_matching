import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const adminLwUserId = process.env.EXPENSE_ADMIN_LW_USERID;

    if (!adminLwUserId) {
      return NextResponse.json(
        { ok: false, error: "EXPENSE_ADMIN_LW_USERID is not set" },
        { status: 500 }
      );
    }

    const token = await getAccessToken();

    const message =
`【経費精算申請】
名前：${body.staff_name}
サービス日：${body.service_date}
時間：${body.service_start_time}${body.service_end_time ? `〜${body.service_end_time}` : ""}
金額：${body.expense_amount}円
内容：${body.expense_detail || "未入力"}

領収書：
${body.receipt_photo_url || "なし"}`;

await sendLWBotMessage(
  token,
  process.env.EXPENSE_ADMIN_CHANNEL_ID!,
  message
);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[expense notify] error", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 }
    );
  }
}