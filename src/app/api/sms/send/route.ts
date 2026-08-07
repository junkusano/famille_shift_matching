// app/api/sms/send/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import twilio, { Twilio } from "twilio";
import { createClient } from "@supabase/supabase-js";

type Item = {
  phone: string;
  body: string;

  // ★ ShiftCardから送る情報
  shift_id?: string;
  kaipoke_cs_id?: string;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function createTwilioClient(): Twilio {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;

  if (!accountSid || !apiKeySid || !apiKeySecret) {
    throw new Error(
      "Twilioの環境変数（ACCOUNT_SID / API_KEY_SID / API_KEY_SECRET）が未設定です"
    );
  }

  return twilio(apiKeySid, apiKeySecret, {
    accountSid,
  });
}

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabaseの環境変数（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が未設定です"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const messagingServiceSid =
  process.env.TWILIO_MESSAGING_SERVICE_SID;

const QUIET_START = Number(
  process.env.QUIET_HOURS_START ?? 21
);

const QUIET_END = Number(
  process.env.QUIET_HOURS_END ?? 8
);

const RATE_PER_SEC = Number(
  process.env.SMS_RATE_PER_SEC ?? 10
);

function inQuietHours(now = new Date()): boolean {
  const jst = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Tokyo",
    })
  );

  const h = jst.getHours();

  return QUIET_START > QUIET_END
    ? h >= QUIET_START || h < QUIET_END
    : h >= QUIET_START && h < QUIET_END;
}

/**
 * 既存仕様を維持
 * STOP文言が無ければ末尾へ追加
 */
function withStop(body: string): string {
  return /stop/i.test(body)
    ? body
    : `${body}\n\n配信停止: 返信で STOP`;
}

/**
 * 日本国内の電話番号をTwilio向けE.164へ変換
 *
 * 090-1234-5678
 * ↓
 * +819012345678
 */
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();

  if (!trimmed) {
    throw new Error("送信先電話番号がありません");
  }

  // +8190... はそのまま
  if (trimmed.startsWith("+")) {
    return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    throw new Error("送信先電話番号が不正です");
  }

  // 81から始まる場合
  if (digits.startsWith("81")) {
    return `+${digits}`;
  }

  // 日本の 0 始まり
  if (digits.startsWith("0")) {
    return `+81${digits.slice(1)}`;
  }

  return `+${digits}`;
}

/**
 * Authorization: Bearer xxx から
 * Supabase Auth user idを取得
 *
 * 既存のSMS利用箇所との互換性を維持するため
 * Authorizationが無い場合はnull
 */
async function getAuthUserId(
  req: NextRequest,
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>
): Promise<string | null> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
}

export async function POST(req: NextRequest) {
  try {
    if (!messagingServiceSid) {
      throw new Error(
        "TWILIO_MESSAGING_SERVICE_SID が未設定です"
      );
    }

    if (inQuietHours()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "静かな時間帯のため送信を抑止しました（QUIET_HOURS_* で変更可）",
        },
        {
          status: 400,
        }
      );
    }

    const payload = (await req.json()) as {
      items?: Item[];
    };

    const items = payload.items ?? [];

    if (items.length === 0) {
      throw new Error("送信対象がありません");
    }

    const client = createTwilioClient();
    const supabaseAdmin = createSupabaseAdmin();

    const authUserId = await getAuthUserId(
      req,
      supabaseAdmin
    );

    const sids: string[] = [];

    const results: Array<{
      sid: string;
      status: string | null;
      phone: string;
    }> = [];

    let i = 0;

    for (const it of items) {
      const phone = normalizePhone(
        String(it.phone || "")
      );

      const body = withStop(
        String(it.body || "")
      ).slice(0, 1600);

      if (!body.trim()) {
        throw new Error("SMS本文がありません");
      }

      try {
        const msg = await client.messages.create({
          to: phone,
          body,
          messagingServiceSid,
        });

        sids.push(msg.sid);

        results.push({
          sid: msg.sid,
          status: msg.status ?? null,
          phone,
        });

        /*
         * ★ ShiftCardからのSMSの場合だけログ保存
         *
         * 既存のSMS送信処理は
         * shift_id / kaipoke_cs_id が無くても
         * 今まで通り動きます。
         */
        if (it.shift_id && it.kaipoke_cs_id) {
          const { error: logError } =
            await supabaseAdmin
              .from("sms_send_logs")
              .insert({
                shift_id: String(it.shift_id),
                kaipoke_cs_id: String(
                  it.kaipoke_cs_id
                ),
                recipient_phone: phone,
                message_body: body,
                twilio_message_sid: msg.sid,
                twilio_status:
                  msg.status ?? null,
                sent_by_auth_user_id:
                  authUserId,
              });

          if (logError) {
            console.error(
              "[sms_send_logs] insert failed",
              logError
            );
          }
        }

        i++;

        if (
          RATE_PER_SEC > 0 &&
          i % RATE_PER_SEC === 0
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000)
          );
        }
      } catch (sendError) {
        /*
         * Twilio送信失敗もログへ残す
         */
        if (it.shift_id && it.kaipoke_cs_id) {
          const { error: logError } =
            await supabaseAdmin
              .from("sms_send_logs")
              .insert({
                shift_id: String(it.shift_id),
                kaipoke_cs_id: String(
                  it.kaipoke_cs_id
                ),
                recipient_phone: phone,
                message_body: body,
                twilio_message_sid: null,
                twilio_status: "failed",
                sent_by_auth_user_id:
                  authUserId,
              });

          if (logError) {
            console.error(
              "[sms_send_logs] failed-log insert failed",
              logError
            );
          }
        }

        throw sendError;
      }
    }

    return NextResponse.json({
      ok: true,
      total: items.length,
      sent: sids.length,
      sids,
      results,
    });
  } catch (err: unknown) {
    console.error("[sms/send]", err);

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(err),
      },
      {
        status: 400,
      }
    );
  }
}