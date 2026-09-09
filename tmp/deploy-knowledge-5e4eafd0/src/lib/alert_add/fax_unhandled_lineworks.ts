import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";
import { buildFaxOcrSummary } from "@/lib/alert_add/fax_ocr_summary";

export const FAX_UNHANDLED_GROUP_NAME = "◆（Fax）対応忘れ防止グループ（ケアマネ）";
const FAX_UNHANDLED_AFTER_HOURS = 24;
const FAX_UNHANDLED_LOOKBACK_DAYS = 30;
const FAX_MESSAGE_LIMIT = 50;

type FaxRow = {
  id: number;
  fax_number: string;
  file_name: string;
  file_id: string | null;
  page_count: number | null;
  status: string | null;
  received_at: string;
};

type PageRow = {
  id: number;
  fax_received_id: number;
  assigned_at: string | null;
  is_advertisement: boolean | null;
  page_number: number;
  ocr_status: string | null;
  suggested_client_name: string | null;
  suggested_doc_type_id: number | null;
};

type UnhandledFax = FaxRow & {
  assignedPageCount: number;
  isAllAdvertisement: boolean;
};

function buildFaxUrl(id: number): string {
  return `${getAppBaseUrl()}/cm-portal/fax/${id}`;
}

async function buildMessage(
  faxes: UnhandledFax[],
  pagesByFax: Map<number, PageRow[]>,
  truncated: number,
  accessToken: string,
): Promise<string> {
  const lines = [
    "📠 FAX対応忘れ防止のお知らせ",
    "",
    `受信から${FAX_UNHANDLED_AFTER_HOURS}時間以上経過し、未対応のFAXがあります。`,
    `対象: ${faxes.length + truncated}件`,
    "",
  ];

  for (const fax of faxes) {
    try {
      const pages = pagesByFax.get(fax.id) ?? [];
      lines.push(await buildFaxOcrSummary(fax, pages, accessToken));
    } catch (error) {
      console.error("[fax-unhandled] OCR/summary failed", {
        fax_id: fax.id,
        error: error instanceof Error ? error.message : String(error),
      });
      const pageCount = fax.page_count ?? 0;
      lines.push(
        `【ファミーユFAX受信】\n送信元: ${fax.fax_number || "不明"}\nPDFファイル: ${fax.file_id ? `https://drive.google.com/open?id=${fax.file_id}` : "読み取れる内容はなし"}\n▼要約:\n読み取れる内容はなし\n状態: ${fax.status || "未設定"} / 振り分け: ${fax.assignedPageCount}/${pageCount}ページ\n▼詳細: ${buildFaxUrl(fax.id)}`,
      );
    }
    lines.push("");
  }

  if (truncated > 0) {
    lines.push("", `※ 表示は先頭${FAX_MESSAGE_LIMIT}件までです。残り${truncated}件あります。`);
  }

  return lines.join("\n");
}

export type FaxUnhandledLineworksResult = {
  ok: boolean;
  groupName: string;
  sent: boolean;
  targetCount: number;
  error?: string;
};

export async function runFaxUnhandledLineworksCheck(): Promise<FaxUnhandledLineworksResult> {
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
      ok: false,
      groupName: FAX_UNHANDLED_GROUP_NAME,
      sent: false,
      targetCount: 0,
      error: "指定されたLINE WORKSグループのチャンネルが見つかりません。",
    };
  }

  const threshold = new Date(Date.now() - FAX_UNHANDLED_AFTER_HOURS * 60 * 60 * 1000).toISOString();
  const lookback = new Date(Date.now() - FAX_UNHANDLED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: faxRows, error: faxError } = await supabaseAdmin
    .from("cm_fax_received")
    .select("id, fax_number, file_name, file_id, page_count, status, received_at")
    .lte("received_at", threshold)
    .gte("received_at", lookback)
    .order("received_at", { ascending: true });

  if (faxError) throw faxError;
  if (!faxRows?.length) {
    return { ok: true, groupName: FAX_UNHANDLED_GROUP_NAME, sent: false, targetCount: 0 };
  }

  const faxIds = faxRows.map((fax) => fax.id);
  const { data: pageRows, error: pageError } = await supabaseAdmin
    .from("cm_fax_pages")
    .select("id, fax_received_id, assigned_at, is_advertisement, page_number, ocr_status, suggested_client_name, suggested_doc_type_id")
    .in("fax_received_id", faxIds);

  if (pageError) throw pageError;

  const pagesByFax = new Map<number, PageRow[]>();
  for (const page of (pageRows ?? []) as PageRow[]) {
    const pages = pagesByFax.get(page.fax_received_id) ?? [];
    pages.push(page);
    pagesByFax.set(page.fax_received_id, pages);
  }

  const unhandled = (faxRows as FaxRow[]).flatMap((fax) => {
    const pages = pagesByFax.get(fax.id) ?? [];
    const pageCount = fax.page_count ?? pages.length;
    const assignedPageCount = pages.filter((page) => page.assigned_at !== null).length;
    const isAllAdvertisement = pages.length > 0 && pages.every((page) => page.is_advertisement === true);
    const needsAction = fax.status === "OCR処理中" || assignedPageCount < pageCount;

    return needsAction && !isAllAdvertisement
      ? [{ ...fax, assignedPageCount, isAllAdvertisement }]
      : [];
  });

  if (!unhandled.length) {
    return { ok: true, groupName: FAX_UNHANDLED_GROUP_NAME, sent: false, targetCount: 0 };
  }

  const visibleFaxes = unhandled.slice(0, FAX_MESSAGE_LIMIT);
  const accessToken = await getAccessToken();
  await sendLWBotMessage(
    group.channel_id,
    await buildMessage(
      visibleFaxes,
      pagesByFax,
      Math.max(0, unhandled.length - visibleFaxes.length),
      accessToken,
    ),
    accessToken,
  );

  return {
    ok: true,
    groupName: FAX_UNHANDLED_GROUP_NAME,
    sent: true,
    targetCount: unhandled.length,
  };
}
