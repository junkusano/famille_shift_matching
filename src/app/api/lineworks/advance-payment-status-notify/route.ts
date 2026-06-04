//src/app/api/lineworks/advance-payment-status-notify/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { applicationNo, status, rejectedReason } = body;

    if (!applicationNo) {
      throw new Error("applicationNo がありません");
    }

    const token = await getAccessToken();

    const { data: app, error: appError } = await supabaseAdmin
      .from("user_advance_payment_applications")
      .select(`
        application_no,
        user_id,
        employee_name,
        amount,
        status,
        paid_at,
        created_at
      `)
      .eq("application_no", applicationNo)
      .maybeSingle();

    if (appError) throw appError;
    if (!app) {
      throw new Error("日払い申請データが見つかりませんでした");
    }

const statusText =
  status === "paid"
    ? "振込済み"
    : status === "rejected"
      ? "却下"
      : status;

const message =
  status === "rejected"
    ? `【日払い申請 却下】
申請番号：${applicationNo}
却下理由：${rejectedReason ?? "-"}
更新日時：${new Date().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      })}`
    : `【日払い申請 ステータス更新】
申請番号：${applicationNo}
ステータス：${statusText}
更新日時：${new Date().toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
      })}`;
    const adminChannelId = "99142491";

    const { data: userRoom, error: userRoomError } = await supabaseAdmin
      .from("group_lw_channel_view")
      .select("channel_id, group_name, group_type, group_account")
      .eq("group_type", "人事労務サポートルーム")
      .eq("group_account", app.user_id)
      .maybeSingle();

    if (userRoomError) throw userRoomError;

    const sentTo: string[] = [];

    await sendLWBotMessage(adminChannelId, message, token);
    sentTo.push("manager");

    if (userRoom?.channel_id) {
      await sendLWBotMessage(userRoom.channel_id, message, token);
      sentTo.push("user-hr-room");
    }

    return NextResponse.json({
      ok: true,
      sentTo,
    });
  } catch (error) {
    console.error("[advance-payment-status-notify] error", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 }
    );
  }
}