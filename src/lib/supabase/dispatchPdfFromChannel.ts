// ==========================================
// /src/lib/supabase/dispatchPdfFromChannel.ts
// - LINE WORKS メッセージログから PDF 添付を抽出
// - rpa_command_requests に status="approved" でUPSERT
// - Supabase 呼び出しは lib 内で完結（cron からは呼ぶだけ）
// ==========================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

export type AttachmentRow = {
  url: string | null;
  mimeType: string | null;
  fileName?: string | null;
  uploaded_at?: string | null;
};
export type MessageRow = {
  channel_id: string;
  message_id: string;
  user_id: string;
  text?: string | null;
  created_at?: string | null;
  attachments?: AttachmentRow[] | null;
};
export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;
  message_id: string;
  uploader_user_id: string;
  file_url: string;
  file_mime: string | null;
  file_name: string | null;
  uploaded_at: string | null;
};
export type RpaUpsertPayload = {
  template_id: string;
  requester_id: string;
  status: "approved";
  original_message_id: string;
  file_url: string;
  request_details: RequestDetails;
};
export type DispatchResult = { inserted: number; skipped: number };

const isPdf = (url?: string | null, mime?: string | null, name?: string | null): boolean => {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("application/pdf") || m === "pdf") return true;
  if ((url ?? "").toLowerCase().endsWith(".pdf")) return true;
  if ((name ?? "").toLowerCase().endsWith(".pdf")) return true;
  return false;
};

const buildDetails = (a: {
  channel_id: string;
  message_id: string;
  uploader_user_id: string;
  file_url: string;
  file_mime?: string | null;
  file_name?: string | null;
  uploaded_at?: string | null;
}): RequestDetails => ({
  source: "lineworks_channel_pdf",
  channel_id: a.channel_id,
  message_id: a.message_id,
  uploader_user_id: a.uploader_user_id,
  file_url: a.file_url,
  file_mime: a.file_mime ?? null,
  file_name: a.file_name ?? null,
  uploaded_at: a.uploaded_at ?? null,
});

/**
 * 環境変数または引数を使って実行。
 * cron からはこの関数を呼ぶだけで OK。
 */
export async function dispatchPdfFromChannel(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;
  until?: string;
  messagesTable?: string;
  rpaTable?: string;
  pageSize?: number;
}): Promise<DispatchResult> {
  const channelId =
    input?.channelId ??
    process.env.TARGET_CHANNEL_ID ??
    "a134fad8-e459-4ea3-169d-be6f5c0a6aad";

  const templateId =
    input?.templateId ??
    process.env.RPA_TEMPLATE_ID ??
    "5c623c6e-c99e-4455-8e50-68ffd92aa77a";

  const since = input?.since;
  const until = input?.until;
  const messagesTable = input?.messagesTable ?? "msg_lw_log_with_group_account_rows";
  const rpaTable = input?.rpaTable ?? "rpa_command_requests";
  const pageSize = input?.pageSize ?? 5000;

  // 1) メッセージ取得
  let q = supabase
    .from(messagesTable)
    .select("channel_id,message_id,user_id,text,created_at,attachments")
    .eq("channel_id", channelId);

  if (since) q = q.gte("created_at", since);
  if (until) q = q.lte("created_at", until);

  const { data: rows, error } = await q.limit(pageSize);
  if (error) throw error;

  const list: MessageRow[] = Array.isArray(rows) ? (rows as MessageRow[]) : [];
  if (list.length === 0) return { inserted: 0, skipped: 0 };

  // 2) PDFのみ抽出
  const payloads: RpaUpsertPayload[] = [];
  for (const r of list) {
    const atts = Array.isArray(r.attachments) ? r.attachments : [];
    for (const a of atts) {
      if (!a?.url) continue;
      if (!isPdf(a.url, a.mimeType, a.fileName)) continue;

      payloads.push({
        template_id: templateId,
        requester_id: r.user_id,
        status: "approved",
        original_message_id: r.message_id,
        file_url: a.url,
        request_details: buildDetails({
          channel_id: r.channel_id,
          message_id: r.message_id,
          uploader_user_id: r.user_id,
          file_url: a.url,
          file_mime: a.mimeType ?? null,
          file_name: a.fileName ?? null,
          uploaded_at: a.uploaded_at ?? r.created_at ?? null,
        }),
      });
    }
  }
  if (payloads.length === 0) return { inserted: 0, skipped: 0 };

  // 3) UPSERT
  const { data: insertedRows, error: upErr } = await supabase
    .from(rpaTable)
    .upsert(payloads, {
      onConflict: "template_id,original_message_id,file_url",
      ignoreDuplicates: true,
    })
    .select("id");
  if (upErr) throw upErr;

  const inserted = Array.isArray(insertedRows) ? insertedRows.length : 0;
  const skipped = payloads.length - inserted;
  return { inserted, skipped };
}
