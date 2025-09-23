import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/** msg_lw_log の行 */
export type MsgRow = {
  id: number;
  timestamp: string | null;
  user_id: string;
  channel_id: string;
  file_id: string | null;
  status: number | null;
};

/** RPA に渡す request_details の型（JSONB） */
export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;
  message_id: string;
  uploader_user_id: string;
  file_url: string;
  file_mime: string;       // application/pdf を想定
  uploaded_at: string | null;
  file_id?: string | null;
  download_url?: string | null;
};

/** rpa_command_requests への Insert 形 */
export type RpaInsertRow = {
  template_id: string;
  requester_id: string;
  status: "approved";
  request_details: RequestDetails;
};

export type DispatchResult = { inserted: number; skipped: number };

/** 既定値・テーブル名 */
const DEFAULT_CHANNEL_ID = "a134fad8-e459-4ea3-169d-be6f5c0a6aad";
const DEFAULT_TEMPLATE_ID = "5c623c6e-c99e-4455-8e50-68ffd92aa77a";
const CAREMGR_TEMPLATE_ID = "8c953c74-17ac-409d-86bb-30807c044a80";

const TEMPLATE_BY_CHANNEL: Record<string, string> = {
  // ケアマネ用チャンネル → ケアマネ用テンプレ
  "fe94ddd0-f600-cc3b-b6f4-73f05019f0a2": CAREMGR_TEMPLATE_ID,
};

const MESSAGES_TABLE = "msg_lw_log";
const RPA_TABLE = "rpa_command_requests";

/** LINE WORKS ファイルダウンロード URL 生成 */
const LW_BOT_NO = process.env.LW_BOT_NO ?? "6807751";
const worksFileDownloadUrl = (botNo: string, channelId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${botNo}/channels/${channelId}/files/${fileId}`;

/**
 * 指定チャンネルの msg_lw_log（status=0 かつ file_id あり）をスキャンし、
 * users.lw_userid → users.auth_user_id を解決して RPA リクエストをまとめて投入。
 * - Insert 成功: msg_lw_log.status = 2（処理済）
 * - 既存重複:     msg_lw_log.status = 9（重複）
 * - requester 不明: msg_lw_log.status = 1（保留）
 */
export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;   // ISO8601
  until?: string;   // ISO8601
  pageSize?: number;
}): Promise<DispatchResult> {
  const channelId = input?.channelId ?? DEFAULT_CHANNEL_ID;
  // ① templateId の決定（引数 > チャンネル別マップ > 既定）
  const templateId = input?.templateId ?? TEMPLATE_BY_CHANNEL[channelId] ?? DEFAULT_TEMPLATE_ID;

  // デフォルト: 直近24時間
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since = input?.since ?? oneDayAgo;
  const until = input?.until ?? now.toISOString();
  const pageSize = input?.pageSize ?? 5000;

  // 未処理(status=0) & 添付あり(file_id IS NOT NULL) & 対象チャンネル & 期間内
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .select("id,timestamp,user_id,channel_id,file_id,status")
    .eq("channel_id", channelId)
    .not("file_id", "is", null)
    .eq("status", 0)
    .gte("timestamp", since)
    .lte("timestamp", until)
    .limit(pageSize);

  if (error) throw new Error(`select ${MESSAGES_TABLE} failed: ${error.message}`);
  const rows = (data ?? []) as MsgRow[];

  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const payloads: RpaInsertRow[] = [];
  const insertedIds: number[] = [];
  const holdIds: number[] = []; // requester 不明などで一旦 保留=1
  const dupIds: number[] = [];  // 既存重複を検出した id

  // 既存 rpa_command_requests の重複検知（message_id ベース）
  const msgIds = rows.map(r => String(r.id));
  type ExistingReq = { request_details: { message_id?: string | null } };

  const { data: existingData, error: existErr } = await supabase
    .from(RPA_TABLE)
    .select("request_details")
    .in("request_details->>message_id", msgIds);

  if (existErr) throw new Error(`select ${RPA_TABLE} for dup check failed: ${existErr.message}`);

  const existing = (existingData ?? []) as ExistingReq[];

  const existingMsgIdSet = new Set<string>(
    existing
      .map(e => e.request_details?.message_id ?? null)
      .filter((v): v is string => typeof v === "string")
  );


  for (const r of rows) {
    if (!r.file_id) {
      holdIds.push(r.id); // 念のため: 添付無しは保留
      continue;
    }

    // 既存重複チェック
    if (existingMsgIdSet.has(String(r.id))) {
      dupIds.push(r.id);
      continue;
    }

    // requester_id を users から解決
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("auth_user_id")
      .eq("lw_userid", r.user_id)
      .maybeSingle();
    if (userErr) throw new Error(`select users failed: ${userErr.message}`);

    const requester = user?.auth_user_id as string | undefined;
    if (!requester) {
      holdIds.push(r.id); // requester 不明 → 保留
      continue;
    }

    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);

    payloads.push({
      template_id: templateId,
      requester_id: requester,
      status: "approved",
      request_details: {
        source: "lineworks_channel_pdf",
        channel_id: r.channel_id,
        message_id: String(r.id),
        uploader_user_id: r.user_id,
        file_url: fileUrl,
        file_mime: "application/pdf",
        uploaded_at: r.timestamp,
        file_id: r.file_id,
        download_url: fileUrl,
      },
    });
  }

  // まとめて Insert
  if (payloads.length > 0) {
    const { error: insErr } = await supabase
      .from(RPA_TABLE)
      .insert(payloads);
    if (insErr) throw new Error(`insert ${RPA_TABLE} failed: ${insErr.message}`);

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

/** ケアマネ用のショートカット（channelId / templateId を自動セット） */
export async function dispatchCareManagerDigisign(input?: {
  since?: string;
  until?: string;
  pageSize?: number;
}): Promise<DispatchResult> {
  return dispatchLineworksPdfToRPA({
    channelId: "fe94ddd0-f600-cc3b-b6f4-73f05019f0a2",
    templateId: CAREMGR_TEMPLATE_ID,
    since: input?.since,
    until: input?.until,
    pageSize: input?.pageSize,
  });
}
