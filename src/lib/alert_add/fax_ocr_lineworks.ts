import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { FAX_UNHANDLED_GROUP_NAME } from "@/lib/alert_add/fax_unhandled_lineworks";
import { buildFaxOcrSummary } from "@/lib/alert_add/fax_ocr_summary";
import { detectFaxReply, type FaxReplyMatch } from "@/lib/alert_add/fax_reply_detection";

const LEGACY_FAX_UNHANDLED_GROUP_NAME = "◆（Fax）対応忘れ防止グループ（ケアマネ）";

// LINE WORKSのcontent.text制限を超えないよう、UTF-8換算でも余裕を持たせる。
const MAX_LINEWORKS_MESSAGE_LENGTH = 1000;

type FaxOcrNotificationInput = {
  faxId: number;
  faxNumber: string | null;
  receivedAt: string | null;
  fileName: string | null;
  fileId: string | null;
  pages: Array<{ pageNumber: number; text: string }>;
};

export type FaxOcrNotificationResult = {
  sent: boolean;
  groupName: string;
  error?: string;
};

function buildFallbackMessage(input: FaxOcrNotificationInput, replyMatch?: FaxReplyMatch): string {
  const text = input.pages
    .map(({ pageNumber, text }) => `【ページ${pageNumber}】\n${text.trim()}`)
    .join("\n\n");

  const detailUrl = `${getAppBaseUrl()}/cm-portal/fax/${input.faxId}`;
  const rawOcr = text || "読み取れる内容はなし";
  const replyNotice = replyMatch?.isReplyCandidate
    ? [
        "▼FAX区分: こちらから送信したFAXへの返信候補",
        `▼返信元候補（当社送信先）: ${replyMatch.destinationOffice || "読み取れる内容はなし"}`,
        `▼当社送信日時: ${replyMatch.sentAt || "読み取れる内容はなし"}`,
      ]
    : [];
  const lines = [
    "【ファミーユFAX受信】",
    `送信元: ${input.faxNumber || "読み取れる内容はなし"}`,
    `PDFファイル: ${input.fileId ? `https://drive.google.com/open?id=${encodeURIComponent(input.fileId)}` : "読み取れる内容はなし"}`,
    "▼文書日付: 読み取れる内容はなし",
    "",
    "▼要約:",
    "【1】送信者情報（事業所名・担当者名）",
    "- 事業所名: 読み取れる内容はなし",
    "- 担当者名: 読み取れる内容はなし",
    "【2】利用者情報（氏名（様をつけて）・住所・連絡先など）",
    "- 氏名: 読み取れる内容はなし",
    "- 住所: 読み取れる内容はなし",
    "- 連絡先: 読み取れる内容はなし",
    "【3】依頼内容（依頼された内容・文脈）",
    "- 内容: 要約生成に失敗したため、原文を確認してください",
    "【4】ケアプランまたは個別援助計画が含まれる場合",
    "- 本人・家族の希望: 読み取れる内容はなし",
    "- サービスに至った理由: 読み取れる内容はなし",
    "- 長期目標・短期目標: 読み取れる内容はなし",
    "- サービス内容: 読み取れる内容はなし",
    "【5】基本情報やアセスメント項目が含まれる場合",
    "- 基本情報: 読み取れる内容はなし",
    "- 疾病・障害の状況: 読み取れる内容はなし",
    "- 生活状況: 読み取れる内容はなし",
    "- サービス利用に至るまでの経緯: 読み取れる内容はなし",
    "- アセスメント: 読み取れる内容はなし",
    "【6】介護保険証・受給者証・負担割合証",
    "- 読み取れる内容はなし",
    "【7】提供表",
    "- 読み取れる内容はなし",
    ...replyNotice,
    "",
    "【文書分類（cs_doc）】",
    "判定_id: 読み取れる内容はなし",
    "判定_label: 読み取れる内容はなし",
    "確信度: 読み取れる内容はなし",
    "",
    "▼利用者名（推定）：読み取れる内容はなし",
    `▼連携：利用者情報にリンク ${detailUrl}`,
    "",
    "▼OCR原文（要約失敗時の確認用）",
  ];
  const prefix = lines.join("\n");
  const availableOcrLength = Math.max(0, MAX_LINEWORKS_MESSAGE_LENGTH - Array.from(prefix).length - 20);
  const ocrPreview = Array.from(rawOcr).slice(0, availableOcrLength).join("");
  const truncationNotice = ocrPreview.length < rawOcr.length
    ? "\n…（続きはFAX詳細で確認してください）"
    : "";
  return `${prefix}\n${ocrPreview}${truncationNotice}`;
}

async function buildMessage(
  input: FaxOcrNotificationInput,
  accessToken: string,
): Promise<string> {
  try {
    return await buildFaxOcrSummary(
      {
        id: input.faxId,
        fax_number: input.faxNumber ?? "",
        file_name: input.fileName ?? "",
        file_id: input.fileId,
        received_at: input.receivedAt ?? "",
        status: "OCR完了",
      },
      input.pages.map((page) => ({
        page_number: page.pageNumber,
        ocr_status: "completed",
        suggested_client_name: null,
        suggested_doc_type_id: null,
      })),
      accessToken,
    );
  } catch (error) {
    console.error("[fax-ocr-lineworks] summary failed; using OCR fallback", {
      faxId: input.faxId,
      error: error instanceof Error ? error.message : String(error),
    });
    return buildFallbackMessage(input, await detectFaxReply(input.faxNumber, input.receivedAt));
  }
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
  await sendLWBotMessage(group.channel_id, await buildMessage(input, accessToken), accessToken);

  return { sent: true, groupName: FAX_UNHANDLED_GROUP_NAME };
}
