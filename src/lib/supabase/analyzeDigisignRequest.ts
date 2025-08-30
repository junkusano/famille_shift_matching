// ======================================================
// analyzeDigisignRequest.ts
// LINE WORKS: msg_lw_log から「PDF 添付（= file_id あり）」を抽出し、
// rpa_command_requests に status="approved" で登録する。
// ======================================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

export type MsgRow = {
  id: number;
  timestamp: string | null;
  user_id: string;
  channel_id: string;
  message: string | null;
  file_id: string | null;
  status: number | null;
};

export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;
  message_id: string;
  uploader_user_id: string;
  file_url: string;
  file_mime: string | null;
  uploaded_at: string | null;
  file_id?: string | null;
  download_url?: string | null;
};

export type RpaInsertRow = {
  template_id: string;
  requester_id: string;
  status: string;
  request_details: RequestDetails;
};

export type DispatchResult = { inserted: number; skipped: number };

const DEFAULT_CHANNEL_ID = "a134fad8-e459-4ea3-169d-be6f5c0a6aad";
const DEFAULT_TEMPLATE_ID = "5c623c6e-c99e-4455-8e50-68ffd92aa77a";
const MESSAGES_TABLE = "msg_lw_log";
const RPA_TABLE = "rpa_command_requests";

const LW_BOT_NO = process.env.LW_BOT_NO ?? "6807751";
const worksFileDownloadUrl = (botNo: string, channelId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${botNo}/channels/${channelId}/files/${fileId}`;

async function resolveRequesterUuid(lwUserId: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/i.test(lwUserId)) return lwUserId;
  return null;
}

export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;
  until?: string;
  pageSize?: number;
}): Promise<DispatchResult> {
  const channelId = input?.channelId ?? DEFAULT_CHANNEL_ID;
  const templateId = input?.templateId ?? DEFAULT_TEMPLATE_ID;

  const now = new Date();
  const since = input?.since ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const until = input?.until ?? now.toISOString();
  const pageSize = input?.pageSize ?? 5000;

  let q = supabase
    .from(MESSAGES_TABLE)
    .select("id,timestamp,user_id,channel_id,message,file_id,status")
    .eq("channel_id", channelId)
    .not("file_id", "is", null)
    .eq("status", 0)
    .gte("timestamp", since)
    .lte("timestamp", until);

  const { data, error } = await q.limit(pageSize);
  if (error) throw new Error(JSON.stringify(error));
  const rows: MsgRow[] = (data ?? []) as MsgRow[];

  const payloads: RpaInsertRow[] = [];
  const insertedMsgIds: number[] = [];
  const dupMsgIds: number[] = [];
  const holdIds: number[] = [];

  for (const r of rows) {
    if (!r.file_id) continue;
    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);
    const requesterUuid = await resolveRequesterUuid(r.user_id);
    if (!requesterUuid) {
      holdIds.push(r.id);
      continue;
    }
    payloads.push({
      template_id: templateId,
      requester_id: requesterUuid,
      status: "approved",
      request_details: {
        source: "lineworks_channel_pdf",
        channel_id: r.channel_id,
        message_id: String(r.id),
        uploader_user_id: r.user_id,
        file_url: fileUrl,
        file_mime: null,
        uploaded_at: r.timestamp,
        file_id: r.file_id,
        download_url: fileUrl,
      },
    });
  }

  if (payloads.length > 0) {
    const { error: insErr } = await supabase
      .from(RPA_TABLE)
      .insert(payloads);
    if (insErr) throw new Error(JSON.stringify(insErr));
    insertedMsgIds.push(...payloads.map(p => Number(p.request_details.message_id)));
  }

  if (insertedMsgIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 2 }).in("id", insertedMsgIds);
  }
  if (dupMsgIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 9 }).in("id", dupMsgIds);
  }
  if (holdIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 1 }).in("id", holdIds);
  }

  return { inserted: insertedMsgIds.length, skipped: holdIds.length };
}
