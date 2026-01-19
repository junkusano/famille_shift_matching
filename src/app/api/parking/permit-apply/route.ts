import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

const OPS_CHANNEL_ID = "71038237-52f6-e937-49d9-8d5a46758065";

/**
 * ここはプロジェクト既存の「LWアクセストークン取得処理」に置き換えてください。
 * 例：refresh token から取得する実装が既にあるはずなので、それを呼ぶ。
 */
async function getLineWorksAccessTokenOrThrow(): Promise<string> {
  const token = process.env.LINEWORKS_BOT_ACCESS_TOKEN;
  if (!token) throw new Error("LINEWORKS_BOT_ACCESS_TOKEN is not set");
  return token;
}

type Body = {
  parking_cs_place_id: string;
};

type PlaceRow = {
  id: string;
  kaipoke_cs_id: string;
  label: string;
  location_link: string | null;
  permit_required: boolean | null;
  parking_orientation: string | null;
  remarks: string | null;
  police_station_place_id: string | null;
};

export async function POST(req: NextRequest) {
  const { user } = await getUserFromBearer(req);
  if (!user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, message: "invalid json" }, { status: 400 });
  }

  if (!body.parking_cs_place_id) {
    return NextResponse.json({ ok: false, message: "missing parking_cs_place_id" }, { status: 400 });
  }

  // place を取得
  const { data: place, error: placeErr } = await supabaseAdmin
    .from("parking_cs_places")
    .select("id,kaipoke_cs_id,label,location_link,permit_required,parking_orientation,remarks,police_station_place_id")
    .eq("id", body.parking_cs_place_id)
    .single<PlaceRow>();

  if (placeErr) {
    return NextResponse.json({ ok: false, message: placeErr.message }, { status: 400 });
  }

  // 利用者名
  const { data: client } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("name")
    .eq("kaipoke_cs_id", place.kaipoke_cs_id)
    .maybeSingle<{ name: string | null }>();

  // 同利用者様の channelID（存在するなら送る）
  // ※テーブル/ビュー名・カラム名はプロジェクトに合わせて必要なら変更してください
  // たとえば group_lw_channel_view に kaipoke_cs_id がある想定
  const { data: clientCh } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("channel_id")
    .eq("kaipoke_cs_id", place.kaipoke_cs_id)
    .maybeSingle<{ channel_id: string | null }>();

  const warning =
    "【駐車注意】交差点・横断歩道・消火栓・バス停・車庫入り口・線引き道路、左右余白など、法定駐車禁止にならない様にくれぐれも注意してください。";

  const msg =
    `【駐車許可証 申請】\n` +
    `利用者：${client?.name ?? "(不明)"}（${place.kaipoke_cs_id}）\n` +
    (place.police_station_place_id ? `認識コード：${place.police_station_place_id}\n` : "") +
    `駐車場所：${place.label}\n` +
    `向き：${place.parking_orientation ?? "-"}\n` +
    `許可証：${place.permit_required ? "必要" : "不要"}\n` +
    `備考：${place.remarks ?? "-"}\n` +
    (place.location_link ? `地図：${place.location_link}\n` : "") +
    `${warning}`;

  try {
    const accessToken = await getLineWorksAccessTokenOrThrow();
    await sendLWBotMessage(OPS_CHANNEL_ID, msg, accessToken);

    const clientChannelId = clientCh?.channel_id ?? null;
    if (clientChannelId) {
      await sendLWBotMessage(clientChannelId, msg, accessToken);
    }
  } catch (e) {
    console.error("[permit-apply] LW notify failed:", e);
    // 通知失敗でも 200 を返してOK（押し直し可能にする）
    return NextResponse.json({ ok: true, warned: true, message: "通知に失敗しました（ログ確認）" });
  }

  return NextResponse.json({ ok: true });
}
