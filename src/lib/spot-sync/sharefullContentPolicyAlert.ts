import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { SharefullContentPolicyReport } from "@/lib/spot-sync/sharefullContentPolicy";
import { sharefullRpaMode } from "@/lib/spot-sync/sharefullScope";
import { createHash } from "node:crypto";

const DEFAULT_CHANNEL_ID = "99142491";

type ContentPolicyBlockInput = {
  coreId: string;
  source: string;
  templateId?: string | null;
  templateTitle?: string | null;
  sourceData: Record<string, unknown>;
  report: SharefullContentPolicyReport;
};

type ContentPolicyBlockDependencies = {
  db: typeof supabaseAdmin;
  getToken: typeof getAccessToken;
  sendMessage: typeof sendLWBotMessage;
  channelId: string;
};

const PUBLIC_TEXT_FIELDS = [
  "template_title",
  "work_description",
  "cautions",
  "auto_message",
  "matching_msg",
] as const;
const PUBLIC_ENV_FIELDS = ["sukima_detail", "sukima_automsg", "sukima_koudou", "sukima_caution"] as const;
const SENT_BUT_UNCONFIRMED = "LINE WORKS送信後の通知記録に失敗しました。重複送信を避けるため自動再送を停止しています。";

function publicTextSnapshot(source: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of PUBLIC_TEXT_FIELDS) {
    if (typeof source[field] === "string") snapshot[field] = source[field];
  }
  if (source.env && typeof source.env === "object" && !Array.isArray(source.env)) {
    const env = source.env as Record<string, unknown>;
    const publicEnv: Record<string, string> = {};
    for (const field of PUBLIC_ENV_FIELDS) {
      if (typeof env[field] === "string") publicEnv[field] = env[field] as string;
    }
    if (Object.keys(publicEnv).length > 0) snapshot.env = publicEnv;
  }
  return snapshot;
}

function dependencies(): ContentPolicyBlockDependencies {
  return {
    db: supabaseAdmin,
    getToken: getAccessToken,
    sendMessage: sendLWBotMessage,
    channelId: process.env.SHAREFULL_CONTENT_POLICY_CHANNEL_ID?.trim() || DEFAULT_CHANNEL_ID,
  };
}

function fingerprint(input: ContentPolicyBlockInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      coreId: input.coreId,
      templateId: input.templateId ?? null,
      report: input.report,
    }))
    .digest("hex");
}

function notificationText(input: ContentPolicyBlockInput): string {
  const findings = input.report.findings.filter((finding) => finding.ruleId !== "gender-sensitive-recruiting").map((finding) => [
    `検出項目: ${finding.matchedText}`,
    `検出ルール: ${finding.ruleId}`,
    finding.replacement ? `自動変換先: ${finding.replacement}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    input.report.status === "blocked"
      ? "Sharefull文面チェックで処理を停止しました。"
      : "Sharefull文面チェック結果を記録しました。案件掲載処理は継続します。",
    "",
    `対象テンプレート管理番号: ${input.coreId}`,
    input.templateId ? `SharefullテンプレートNo.: ${input.templateId}` : null,
    `テンプレート名: ${input.templateTitle?.trim() || "未設定"}`,
    "",
    findings,
    "",
    input.report.status === "blocked"
      ? "停止理由: シェアフル掲載前に確認が必要な文言を検出しました。"
      : "記録内容: タイミー表記はシェアフル表記へ変換し、性別に関する要確認表現は追跡記録しました。",
  ].filter((line): line is string => line !== null).join("\n");
}

/** 停止事実を環境別の監査テーブルへ保存してから、LINE WORKSへ通知する。 */
export async function recordSharefullContentPolicyBlock(input: ContentPolicyBlockInput): Promise<{
  recorded: boolean;
  notified: boolean;
  notificationError?: string;
}> {
  const deps = dependencies();
  const key = fingerprint(input);
  const isProduction = sharefullRpaMode() === "production";
  const tableName = !isProduction
    ? "sharefull_rpa_test_content_policy_blocks"
    : "sharefull_content_policy_blocks";
  const { data: row, error } = await deps.db
    .from(tableName as never)
    .upsert({
      fingerprint: key,
      core_id: input.coreId,
      source: input.source,
      sharefull_template_id: input.templateId ?? null,
      template_title: input.templateTitle ?? null,
      // 監査用には掲載本文だけを残し、行全体や内部項目・利用者情報は保存しない。
      source_data: publicTextSnapshot(input.sourceData),
      policy_report: input.report,
      status: input.report.status === "blocked" ? "blocked" : "recorded",
      updated_at: new Date().toISOString(),
    }, { onConflict: "fingerprint" })
    .select(isProduction ? "id,notified_at,notification_claimed_at,notification_error" : "id,notified_at,notification_error")
    .single();
  const rowRecord = row as unknown as { id: string; notified_at?: string | null; notification_claimed_at?: string | null; notification_error?: string | null } | null;
  if (error || !rowRecord) throw error ?? new Error("停止記録を保存できませんでした");
  // 性別に関する表現は監査テーブルに記録するだけで、LINE WORKSには送らない。
  // それ以外も、処理継続となる flagged/transformed は通知対象外。
  if (input.report.status !== "blocked" || !input.report.findings.some((finding) => finding.action === "block" && finding.ruleId !== "gender-sensitive-recruiting")) {
    return { recorded: true, notified: false };
  }
  if (rowRecord.notified_at) return { recorded: true, notified: true };
  if (rowRecord.notification_error === SENT_BUT_UNCONFIRMED) {
    return { recorded: true, notified: false, notificationError: SENT_BUT_UNCONFIRMED };
  }

  const existingClaim = rowRecord.notification_claimed_at;
  if (isProduction) {
    let claimQuery = deps.db.from(tableName as never)
      .update({ notification_claimed_at: new Date().toISOString(), notification_error: null, updated_at: new Date().toISOString() })
      .eq("id", rowRecord.id)
      .is("notified_at", null);
    const staleBefore = Date.now() - 10 * 60 * 1000;
    if (existingClaim) {
      if (!Number.isFinite(Date.parse(existingClaim)) || Date.parse(existingClaim) > staleBefore) {
        return { recorded: true, notified: false };
      }
      // 送信前後でプロセスが停止した場合、LINE WORKSが受理済みかDBだけでは判断できない。
      // 自動でclaimを取り直すと重複通知になり得るため、古いclaimも手動確認まで保持する。
      return { recorded: true, notified: false, notificationError: "古い通知claimがあります。LINE WORKSの送信履歴を確認してから再実行してください。" };
    } else {
      claimQuery = claimQuery.is("notification_claimed_at", null);
    }
    const { data: claim, error: claimError } = await claimQuery.select("id").maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return { recorded: true, notified: false };
  }

  try {
    await deps.sendMessage(deps.channelId, notificationText(input), await deps.getToken());
  } catch (notificationError) {
    const message = notificationError instanceof Error ? notificationError.message : String(notificationError);
    const failureUpdate: Record<string, unknown> = { notification_error: message, updated_at: new Date().toISOString() };
    if (isProduction) failureUpdate.notification_claimed_at = null;
    await deps.db.from(tableName as never)
      .update(failureUpdate)
      .eq("id", rowRecord.id);
    return { recorded: true, notified: false, notificationError: message };
  }

  const confirmationUpdate: Record<string, unknown> = { notified_at: new Date().toISOString(), notification_error: null, updated_at: new Date().toISOString() };
  if (isProduction) confirmationUpdate.notification_claimed_at = null;
  const { error: confirmationError } = await deps.db.from(tableName as never)
    .update(confirmationUpdate)
    .eq("id", rowRecord.id);
  if (confirmationError) {
    // LINE WORKSは受理済み。状態保存の失敗後に自動再送すると重複するため、手動確認を要する印を残す。
    await deps.db.from(tableName as never)
      .update({ notification_error: SENT_BUT_UNCONFIRMED, updated_at: new Date().toISOString() })
      .eq("id", rowRecord.id);
    return { recorded: true, notified: false, notificationError: SENT_BUT_UNCONFIRMED };
  }
  return { recorded: true, notified: true };
}
