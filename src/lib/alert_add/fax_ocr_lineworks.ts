import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { FAX_UNHANDLED_GROUP_NAME } from "@/lib/alert_add/fax_unhandled_lineworks";

const LEGACY_FAX_UNHANDLED_GROUP_NAME = "◆（Fax）対応忘れ防止グループ（ケアマネ）";

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
    .join("\n\n");

  const detailUrl = `${getAppBaseUrl()}/cm-portal/fax/${input.faxId}`;
  const prefix = [
    "📠 FAXのOCR処理が完了しました",
    "",
    `受信日時: ${input.receivedAt ?? "不明"}`,
    `送信元FAX: ${input.faxNumber || "不明"}`,
    `ファイル名: ${input.fileName || "不明"}`,
    `処理ページ: ${input.pages.length}ページ`,
    "",
    "▼ OCR結果",
  ].join("\n");
  const suffix = [
    "",
    `▼ FAX詳細: ${detailUrl}`,
    "",
    "※ OCR結果は必ず原本と照合してください。",
  ].join("\n");
  const availableOcrLength = Math.max(
    0,
    MAX_LINEWORKS_MESSAGE_LENGTH - Array.from(prefix + suffix).length - 40,
  );
  const ocrPreview = Array.from(text || "読み取れる内容はありません。").slice(0, availableOcrLength).join("");
  const truncationNotice = ocrPreview.length < text.length
    ? "\n…（続きはFAX詳細で確認してください）"
    : "";

  return `${prefix}\n${ocrPreview}${truncationNotice}${suffix}`;
}

export async function notifyFaxOcrCompleted(
  input: FaxOcrNotificationInput,
): Promise<FaxOcrNotificationResult> {
  const { data: groups, error: groupError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_name, channel_id")
    .in("group_name", [FAX_UNHANDLED_GROUP_NAME, LEGACY_FAX_UNHANDLED_GROUP_NAME])
    .not("channel_id", "is", null)
    .limit(10);

  if (groupError) throw groupError;
  const group = (groups ?? []).find((item) => item.group_name === FAX_UNHANDLED_GROUP_NAME)
    ?? (groups ?? []).find((item) => item.group_name === LEGACY_FAX_UNHANDLED_GROUP_NAME);
  if (!group?.channel_id) {
    return {
      sent: false,
      groupName: FAX_UNHANDLED_GROUP_NAME,
      error: "指定されたLINE WORKSグループのチャンネルが見つかりません。",
    };
  }

  const accessToken = await getAccessToken();
  await sendLWBotMessage(group.channel_id, buildMessage(input), accessToken);

  return { sent: true, groupName: FAX_UNHANDLED_GROUP_NAME };
}
