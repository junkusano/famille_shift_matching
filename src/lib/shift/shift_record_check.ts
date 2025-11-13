// src/lib/shift/shift_record_check.ts
// 未了シフトの担当者へのリマインドメッセージ送信（本体ロジック）
// ※ supabase は lib 内でのみ使用（APIでは使わない）

import { supabase } from "@/lib/supabaseClient";
import { subHours } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

const timeZone = "Asia/Tokyo";
const DRY_RUN_DEFAULT = false; // 既定では送信する（API側から dryRun 指定で抑止）

export type ShiftRecordCheckResult = {
  ok: boolean;
  checked: number;
  errors?: Array<{ code?: string; message: string; details?: string; hint?: string }>;
};

export async function runShiftRecordCheck(opts: { now?: Date; dryRun?: boolean } = {}): Promise<ShiftRecordCheckResult> {
  try {
    const now = opts.now ?? new Date();
    const DRY_RUN = opts.dryRun ?? DRY_RUN_DEFAULT;

    // 「JSTで見た1時間前」
    const oneHourAgo = subHours(now, 1);

    // 文字列にするときも常にJSTで整形
    const endTimeLimitDate = formatInTimeZone(oneHourAgo, timeZone, "yyyy-MM-dd");
    const endTimeLimitTime = formatInTimeZone(oneHourAgo, timeZone, "HH:mm");

    // デバッグ出力（JSTで見えるように）
    console.log("[JST] oneHourAgo:", formatInTimeZone(oneHourAgo, timeZone, "yyyy-MM-dd HH:mm"));
    console.log("[JST] endTimeDate:", endTimeLimitDate);
    console.log("[JST] endTimeTime:", endTimeLimitTime);

    // 1. 全担当者（User）
    const { data: usersData, error: usersError } = await supabase
      .from("user_entry_united_view_single")
      .select("user_id, channel_id, lw_userid")
      .neq("status", "removed_from_lineworks_kaipoke")
      .neq("status", "inactive");
    if (usersError) throw usersError;

    console.log("usersData:", usersData);

    // 2. 全利用者（Client）
    const { data: clientList, error: clientError } = await supabase
      .from("group_lw_channel_view")
      .select("group_account, channel_id")
      .eq("group_type", "利用者様情報連携グループ");
    if (clientError) throw clientError;

    if (!clientList || clientList.length === 0) {
      console.log("No clients found. Exiting.");
      return { ok: true, checked: 0 };
    }

    // 送信キュー（channelId -> message）
    const clientMessageQueue = new Map<string, string>();

    // 3. シフト（未了＆カットオフ判定）
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

    console.log("取得したシフトデータ:", shifts);

    let checked = 0;

    // (A) 担当者ループ
    for (const user of usersData ?? []) {
      const userId = user.user_id;

      // (B) 利用者ループ
      for (const client of clientList) {
        const kaipokeCsId = client.group_account;
        const clientChannelId = client.channel_id;
        if (!clientChannelId) continue;

        // 担当者×利用者で未了シフト抽出
        const unfinishedShifts = (shifts ?? []).filter(
          (shift) =>
            (shift.staff_01_user_id === userId ||
              shift.staff_02_user_id === userId ||
              shift.staff_03_user_id === userId) &&
            shift.kaipoke_cs_id === kaipokeCsId
        );

        const clientUnfinishedShifts: string[] = unfinishedShifts.map(
          (shift) =>
            `・${shift.shift_start_date} ${(shift.shift_start_time ?? "")
              .split(":")
              .slice(0, 2)
              .join(":")} - ${(shift.shift_end_time ?? "")
              .split(":")
              .slice(0, 2)
              .join(":")}`
        );

        if (clientUnfinishedShifts.length > 0) {
          const header = `訪問記録が未了です。`;
          const body = clientUnfinishedShifts.join("\n");
          const link = `https://myfamille.shi-on.net/portal/shift-view?openExternalBrowser=1 `;
          const messageSegment = `\n\n<m userId="${user.lw_userid}">さん\n${header}\n${body}\n未了の記録を確認し、完了させてください。\n${link}`;

          const currentMessage = clientMessageQueue.get(clientChannelId) || `【未了訪問記録の通知】\n`;
          clientMessageQueue.set(clientChannelId, currentMessage + messageSegment);

          checked += clientUnfinishedShifts.length;
        }
      }
    }

    // 送信（cronは dryRun:true で抑止）
    console.log(`[INFO] Sending ${clientMessageQueue.size} messages to client channels...`);
    if (clientMessageQueue.size === 0) {
      console.log("[INFO] No messages to send.");
    } else if (DRY_RUN) {
      console.log("[DRY_RUN] メッセージは送信しません（ログのみ出力）。");
      let idx = 0;
      for (const [channelId, message] of clientMessageQueue.entries()) {
        console.log(
          `\n----- [MESSAGE ${++idx}/${clientMessageQueue.size}] -----\n` +
            `channelId: ${channelId}\nlength   : ${message.length}\ncontent  :\n${message}\n` +
            `----- [END MESSAGE ${idx}] -----\n`
        );
      }
    } else {
      const accessToken = await getAccessToken();
      const sent = new Set<string>();
      let sentCount = 0;
      for (const [channelId, message] of clientMessageQueue.entries()) {
        if (sent.has(channelId)) continue; // 二重送信ガード
        sent.add(channelId);
        console.log(`[SEND] -> channelId=${channelId}, bytes=${message.length}`);
        await sendLWBotMessage(channelId, message, accessToken);
        sentCount++;
      }
      console.log(`[INFO] Sent ${sentCount} / ${clientMessageQueue.size} messages.`);
    }

    console.log("--- Unfinished Shift Alert Cron Job Finished Successfully ---");
    return { ok: true, checked };
  } catch (e) {
    return {
      ok: false,
      checked: 0,
      errors: [{ message: String(e?.message ?? e), code: e?.code, details: e?.details, hint: e?.hint }],
    };
  }
}
