// ================================
// 2) src/app/api/lineworks/advance-payment-notify/route.ts）
// ================================
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      userId,
      userName,
      applicationDate,
      amount,
      applicationNo,
    } = body;

    const text =
      `${userName}さんが、` +
      `${applicationDate}に` +
      `${amount.toLocaleString()}円の` +
      `日払い申請を行いました。\n` +
      `申請番号：${applicationNo}`;

    const { data: roomData, error: roomError } = await supabase
  .from("group_lw_channel_view")
  .select("channel_id")
  .eq("user_id", userId)
  .maybeSingle();

if (roomError) throw roomError;

if (!roomData?.channel_id) {
  throw new Error("LINE WORKSルームが見つかりませんでした");
}

const channelId = roomData.channel_id;

console.log(channelId);
console.log(text);

    // ここで LINE WORKS API送信

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
      },
      {
        status: 500,
      }
    );
  }
}