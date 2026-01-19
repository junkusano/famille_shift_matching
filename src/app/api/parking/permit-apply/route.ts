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


import crypto from "crypto";

let cachedAccessToken: string | null = null;
let cachedExpireAtMs = 0;

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwtRS256(header: object, payload: object, privateKeyPem: string) {
  const h = base64url(JSON.stringify(header));
  const p = base64url(JSON.stringify(payload));
  const data = `${h}.${p}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(data);
  signer.end();

  const sig = signer.sign(privateKeyPem);
  return `${data}.${base64url(sig)}`;
}

async function getLineWorksAccessTokenOrThrow(): Promise<string> {
  // 60秒バッファでキャッシュ
  if (cachedAccessToken && Date.now() < cachedExpireAtMs - 60_000) {
    return cachedAccessToken;
  }

  const clientId = process.env.LINEWORKS_CLIENT_ID;
  const clientSecret = process.env.LINEWORKS_CLIENT_SECRET;
  const serviceAccount = process.env.LINEWORKS_SERVICE_ACCOUNT;
  let privateKey = process.env.LINEWORKS_PRIVATE_KEY;

  if (!clientId) throw new Error("LINEWORKS_CLIENT_ID is not set");
  if (!clientSecret) throw new Error("LINEWORKS_CLIENT_SECRET is not set");
  if (!serviceAccount) throw new Error("LINEWORKS_SERVICE_ACCOUNT is not set");
  if (!privateKey) throw new Error("LINEWORKS_PRIVATE_KEY is not set");

  // VercelのENVに貼ると改行が \n になることが多いので復元
  privateKey = privateKey.replace(/\\n/g, "\n");

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + 60 * 60; // 最大60分（例）
  const jwt = signJwtRS256(
    { alg: "RS256", typ: "JWT" },
    { iss: clientId, sub: serviceAccount, iat: nowSec, exp: expSec },
    privateKey
  );

  const form = new URLSearchParams();
  form.set("assertion", jwt);
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("scope", "bot"); // bot送信に必要（必要なら拡張） :contentReference[oaicite:1]{index=1}

  const tokenRes = await fetch("https://auth.worksmobile.com/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await tokenRes.text();
  if (!tokenRes.ok) {
    throw new Error(`LINEWORKS token failed: ${tokenRes.status} ${text}`);
  }

  const json = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("LINEWORKS token response missing access_token");

  cachedAccessToken = json.access_token;
  cachedExpireAtMs = Date.now() + (json.expires_in ?? 3600) * 1000;
  return cachedAccessToken;
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
