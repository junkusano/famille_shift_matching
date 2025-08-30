import { supabaseAdmin as supabase } from "@/lib/supabase/service";

export type MsgRow = {
  id: number;
  timestamp: string | null;
  user_id: string;
  channel_id: string;
  file_id: string | null;
  status: number | null;
};

export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;
  message_id: string;
  uploader_user_id: string;
  file_url: string;
  file_mime: string;       // ← 独自機能: MIME を明記（PDF前提なら "application/pdf"）
  uploaded_at: string | null;
  file_id?: string | null;
  download_url?: string | null;
};

export type RpaInsertRow = {
  template_id: string;
  requester_id: string;
  status: "approved";
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

export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;
  until?: string;
  pageSize?: number;
}): Promise<DispatchResult> {
  const channelId = input?.channelId ?? DEFAULT_CHANNEL_ID;
  const templateId = input?.templateId ?? DEFAULT_TEMPLATE_ID;

  // デフォルト: 直近24時間
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since = input?.since ?? oneDayAgo;
  const until = input?.until ?? now.toISOString();
  const pageSize = input?.pageSize ?? 5000;

  // 未処理(status=0) & 添付あり(file_id IS NOT NULL)
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("id,timestamp,user_id,channel_id,file_id,status")
    .eq("channel_id", channelId)
    .not("file_id", "is", null)
    .eq("status", 0)
    .gte("timestamp", since)
    .lte("timestamp", until)
    .limit(pageSize);

  if (error) throw new Error(JSON.stringify(error));
  const rows: MsgRow[] = (data ?? []) as MsgRow[];
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const payloads: RpaInsertRow[] = [];
  const insertedIds: number[] = [];
  const holdIds: number[] = [];
  const dupIds: number[] = []; // 既存重複を扱う場合はここへ積む（必要最小限のまま）

  for (const r of rows) {
    if (!r.file_id) continue;

    // requester_id を users テーブルから解決（添付と同じ流儀）
    const { data: user } = await supabase
      .from("users")
      .select("auth_user_id")
      .eq("lw_userid", r.user_id)
      .maybeSingle();

    if (!user?.auth_user_id) {
      holdIds.push(r.id); // requester 不明 → 保留
      continue;
    }

    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);

    payloads.push({
      template_id: templateId,
      requester_id: user.auth_user_id,
      status: "approved",
      request_details: {
        source: "lineworks_channel_pdf",
        channel_id: r.channel_id,
        message_id: String(r.id),
        uploader_user_id: r.user_id,
        file_url: fileUrl,
        file_mime: "application/pdf", // ← PDF前提で明記（判定は行わない）
        uploaded_at: r.timestamp,
        file_id: r.file_id,
        download_url: fileUrl,
      },
    });
  }

  if (payloads.length > 0) {
    // 'ins' を受け取らず、未使用変数の警告を回避
    const { error: insErr } = await supabase
      .from(RPA_TABLE)
      .insert(payloads);
    if (insErr) throw new Error(JSON.stringify(insErr));

    insertedIds.push(...payloads.map(p => Number(p.request_details.message_id)));
  }

  // status 更新
  if (insertedIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 2 }).in("id", insertedIds);
  }
  if (dupIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 9 }).in("id", dupIds);
  }
  if (holdIds.length > 0) {
    await supabase.from(MESSAGES_TABLE).update({ status: 1 }).in("id", holdIds);
  }

  return { inserted: insertedIds.length, skipped: holdIds.length };
}
