// /api/shift-records/check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";
import { supabase } from "@/lib/supabaseClient";
import { subHours } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const timeZone = "Asia/Tokyo";
const DRY_RUN = false;

type WorkDetail = {
  messageTargets: number;     // 送信先チャンネル数
  sentCount: number;          // 実送信数（DRY_RUN時は0）
  examinedUsers: number;      // スキャン対象ユーザー数
  examinedClients: number;    // スキャン対象クライアント数
  matchedShifts: number;      // 該当シフト件数
};

type WorkResult =
  | { ok: true; detail: WorkDetail }
  | { ok: false; error: string };

function isAuthorized(req: NextRequest): boolean {
  const isLocal = process.env.NODE_ENV !== "production";
  if (isLocal) return true;

  // Vercel Scheduler からの直接叩き
  if (req.headers.get("x-vercel-cron") === "1") return true;

  // 内部呼び出し／手動実行用（Bearer）
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return Boolean(token) && token === process.env.CRON_SECRET;
}

// ここに元の実処理
async function doWork(): Promise<WorkResult> {
  try {
    const now = new Date();
    const oneHourAgo = subHours(now, 1);

    const endTimeLimitDate = formatInTimeZone(oneHourAgo, timeZone, "yyyy-MM-dd");
    const endTimeLimitTime = formatInTimeZone(oneHourAgo, timeZone, "HH:mm");

    // 1) 担当者
    const { data: usersData, error: usersError } = await supabase
      .from("user_entry_united_view_single")
      .select("user_id, channel_id, lw_userid")
      .neq("status", "removed_from_lineworks_kaipoke")
      .neq("status", "inactive");
    if (usersError) throw usersError;

    // 2) 利用者チャンネル
    const { data: clientList, error: clientError } = await supabase
      .from("group_lw_channel_view")
      .select("group_account, channel_id")
      .eq("group_type", "利用者様情報連携グループ");
    if (clientError) throw clientError;

    if (!clientList || clientList.length === 0) {
      return { ok: true, detail: { messageTargets: 0, sentCount: 0, examinedUsers: usersData?.length ?? 0, examinedClients: 0, matchedShifts: 0 } };
    }

    // 3) シフト
    const { data: shifts, error: shiftError } = await supabase
      .from("shift_shift_record_view")
      .select("*")
      .or(`record_status.eq.draft,record_status.is.null`)
      .or(
        `shift_start_date.lt.${endTimeLimitDate},` +
        `and(shift_start_date.eq.${endTimeLimitDate},shift_end_time.lte.${endTimeLimitTime})`
      )
      .gte("shift_start_date", "2025-10-01");
    if (shiftError) throw shiftError;

    const clientMessageQueue = new Map<string, string>();
    let matchedShifts = 0;

    for (const user of usersData ?? []) {
      const userId = user.user_id;
      for (const client of clientList) {
        const kaipokeCsId = client.group_account;
        const clientChannelId = client.channel_id;
        if (!clientChannelId) continue;

        const unfinishedShifts = (shifts ?? []).filter((s) =>
          (s.staff_01_user_id === userId || s.staff_02_user_id === userId || s.staff_03_user_id === userId) &&
          s.kaipoke_cs_id === kaipokeCsId
        );

        if (unfinishedShifts.length === 0) continue;
        matchedShifts += unfinishedShifts.length;

        const bodyLines = unfinishedShifts.map((s) =>
          `・${s.shift_start_date} ${(s.shift_start_time ?? "").split(":").slice(0, 2).join(":")} - ${(s.shift_end_time ?? "").split(":").slice(0, 2).join(":")}`
        );

        const header = `訪問記録が未了です。`;
        const link = `https://myfamille.shi-on.net/portal/shift-view?openExternalBrowser=1`;
        const segment = `\n\n<m userId="${user.lw_userid}">さん\n${header}\n${bodyLines.join("\n")}\n未了の記録を確認し、完了させてください。\n${link}`;

        const current = clientMessageQueue.get(clientChannelId) ?? "【未了訪問記録の通知】\n";
        clientMessageQueue.set(clientChannelId, current + segment);
      }
    }

    let sentCount = 0;
    if (!DRY_RUN && clientMessageQueue.size > 0) {
      const accessToken = await getAccessToken();
      const sent = new Set<string>();
      for (const [channelId, message] of clientMessageQueue.entries()) {
        if (sent.has(channelId)) continue;
        sent.add(channelId);
        await sendLWBotMessage(channelId, message, accessToken);
        sentCount++;
      }
    }

    return {
      ok: true,
      detail: {
        messageTargets: clientMessageQueue.size,
        sentCount,
        examinedUsers: usersData?.length ?? 0,
        examinedClients: clientList.length,
        matchedShifts,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}

function unauthorizedResponse(req: NextRequest) {
  // 最小限のデバッグ情報（秘匿情報は出さない）
  const cron = req.headers.get("x-vercel-cron");
  const hasBearer = (req.headers.get("authorization") ?? "").startsWith("Bearer ");
  return NextResponse.json(
    { success: false, message: "Unauthorized", hint: { xVercelCron: cron ?? null, hasBearer } },
    { status: 401 }
  );
}

// GET / POST どちらで叩いても同じ動作に
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse(req);

  const result = await doWork();

  if (!result.ok) {
    const err = "error" in result ? result.error : "unknown error";
    return NextResponse.json({ success: false, error: err }, { status: 500 });
  }

  return NextResponse.json({ success: true, detail: result.detail }, { status: 200 });
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorizedResponse(req);

  const result = await doWork();

  if (!result.ok) {
    const err = "error" in result ? result.error : "unknown error";
    return NextResponse.json({ success: false, error: err }, { status: 500 });
  }

  return NextResponse.json({ success: true, detail: result.detail }, { status: 200 });
}
