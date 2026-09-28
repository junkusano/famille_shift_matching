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
  const findings = input.report.findings.map((finding) => [
    `検出項目: ${finding.matchedText}`,
    `検出ルール: ${finding.ruleId}`,
    finding.replacement ? `自動変換先: ${finding.replacement}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");

  return [
    "テンプレート作成を停止しました。",
    "",
    `対象テンプレート管理番号: ${input.coreId}`,
    input.templateId ? `SharefullテンプレートNo.: ${input.templateId}` : null,
    `テンプレート名: ${input.templateTitle?.trim() || "未設定"}`,
    "",
    findings,
    "",
    "停止理由: シェアフル掲載前に確認が必要な文言を検出しました。",
    "対応: 内容を修正後、再実行してください。",
  ].filter((line): line is string => line !== null).join("\n");
}

/** テスト環境の停止事実を記録し、記録後にLINE WORKSへ一度だけ通知する。 */
export async function recordSharefullContentPolicyBlock(input: ContentPolicyBlockInput): Promise<{
  recorded: boolean;
  notified: boolean;
  notificationError?: string;
}> {
  if (sharefullRpaMode() !== "test") return { recorded: false, notified: false };

  const deps = dependencies();
  const key = fingerprint(input);
  const { data: row, error } = await deps.db
    .from("sharefull_rpa_test_content_policy_blocks" as never)
    .upsert({
      fingerprint: key,
      core_id: input.coreId,
      source: input.source,
      sharefull_template_id: input.templateId ?? null,
      template_title: input.templateTitle ?? null,
      source_data: input.sourceData,
      policy_report: input.report,
      status: "blocked",
      updated_at: new Date().toISOString(),
    }, { onConflict: "fingerprint" })
    .select("id,notified_at")
    .single();
  const rowRecord = row as unknown as { id: string; notified_at?: string | null } | null;
  if (error || !rowRecord) throw error ?? new Error("停止記録を保存できませんでした");
  if (rowRecord.notified_at) return { recorded: true, notified: true };

  try {
    await deps.sendMessage(deps.channelId, notificationText(input), await deps.getToken());
    await deps.db.from("sharefull_rpa_test_content_policy_blocks" as never)
      .update({ notified_at: new Date().toISOString(), notification_error: null })
      .eq("id", rowRecord.id);
    return { recorded: true, notified: true };
  } catch (notificationError) {
    const message = notificationError instanceof Error ? notificationError.message : String(notificationError);
    await deps.db.from("sharefull_rpa_test_content_policy_blocks" as never)
      .update({ notification_error: message, updated_at: new Date().toISOString() })
      .eq("id", rowRecord.id);
    return { recorded: true, notified: false, notificationError: message };
  }
}
