import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { FAX_UNHANDLED_GROUP_NAME } from "@/lib/alert_add/fax_unhandled_lineworks";

const MAX_OCR_TEXT_LENGTH = 7000;
// LINE WORKSのcontent.text制限を超えないよう、UTF-8換算でも余裕を持たせる。
const MAX_LINEWORKS_MESSAGE_LENGTH = 1000;

type FaxOcrNotificationInput = {
  faxId: number;
  faxNumber: string | null;
  receivedAt: string | null;
  fileName: string | null;
  pages: Array<{ pageNumber: number; text: string }>;
};

export type FaxOcrNotificationResult = {
  sent: boolean;
  groupName: string;
  error?: string;
};

function buildMessage(input: FaxOcrNotificationInput): string {
  const text = input.pages
    .map(({ pageNumber, text }) => `【ページ${pageNumber}】\n${text.trim()}`)
    .join("\n\n")
    .slice(0, MAX_OCR_TEXT_LENGTH);

  return [
    "📠 FAXのOCR処理が完了しました",
    "",
    `受信日時: ${input.receivedAt ?? "不明"}`,
    `送信元FAX: ${input.faxNumber || "不明"}`,
    `ファイル名: ${input.fileName || "不明"}`,
    `処理ページ: ${input.pages.length}ページ`,
    "",
    "▼ OCR結果",
    text || "読み取れる内容はありません。",
    "",
    `▼ FAX詳細: ${getAppBaseUrl()}/cm-portal/fax/${input.faxId}`,
    "",
    "※ OCR結果は必ず原本と照合してください。",
  ].join("\n");
}

function splitMessage(message: string): string[] {
  const characters = Array.from(message);
  const chunks: string[] = [];

  for (let index = 0; index < characters.length; index += MAX_LINEWORKS_MESSAGE_LENGTH) {
    chunks.push(characters.slice(index, index + MAX_LINEWORKS_MESSAGE_LENGTH).join(""));
  }

  return chunks.length > 0 ? chunks : ["読み取れる内容はありません。"];
}

export async function notifyFaxOcrCompleted(
  input: FaxOcrNotificationInput,
): Promise<FaxOcrNotificationResult> {
  const { data: group, error: groupError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_name, channel_id")
    .eq("group_name", FAX_UNHANDLED_GROUP_NAME)
    .not("channel_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (groupError) throw groupError;
  if (!group?.channel_id) {
    return {
      sent: false,
      groupName: FAX_UNHANDLED_GROUP_NAME,
      error: "指定されたLINE WORKSグループのチャンネルが見つかりません。",
    };
  }

  const accessToken = await getAccessToken();
  const messages = splitMessage(buildMessage(input));

  for (const [index, message] of messages.entries()) {
    const partLabel = messages.length > 1 ? `\n[${index + 1}/${messages.length}]` : "";
    await sendLWBotMessage(group.channel_id, `${message}${partLabel}`, accessToken);
  }

  return { sent: true, groupName: FAX_UNHANDLED_GROUP_NAME };
}
