// ======================================================
// analyzeDigisignRequest.ts
// LINE WORKS: msg_lw_log から「PDF 添付（= file_id あり）」を抽出し、
// rpa_command_requests に status="approved" で登録する。
// - DBスキーマ準拠（original_message_id/file_url カラムは使わない）
// - 重複排除は request_details(JSONB) を検索して事前除外
// ======================================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// ---------- 型 ----------
export type MsgRow = {
  id: number;
  timestamp: string | null;
  event_type: string | null;
  user_id: string;        // LINE WORKS 側ユーザーID（UUIDとは限らない）
  channel_id: string;
  domain_id: string | null;
  message: string | null;
  file_id: string | null; // 添付があると入る
  members: unknown;
  status: number | null;
};

export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;     // 文字列化
  message_id: string;     // msg_lw_log.id を文字列で保存
  uploader_user_id: string;
  file_url: string;       // Works API ダウンロードURL
  file_mime: string | null;
  file_name: string | null;
  uploaded_at: string | null;
  file_id?: string | null;
  download_url?: string | null;
};

export type RpaInsertRow = {
  template_id: string;            // uuid 文字列
  requester_id: string | null;    // uuid 文字列 or null
  status: string;                 // 'approved'
  request_details: RequestDetails;// JSONB
  requested_at?: string;          // now() 相当を明示したい場合
};

export type DispatchResult = { inserted: number; skipped: number };

// ---------- 設定 ----------
const DEFAULT_CHANNEL_ID = "a134fad8-e459-4ea3-169d-be6f5c0a6aad";
const DEFAULT_TEMPLATE_ID = "5c623c6e-c99e-4455-8e50-68ffd92aa77a";
const MESSAGES_TABLE = "msg_lw_log";
const RPA_TABLE = "rpa_command_requests";

// Line Works Files API URLを組み立て（botNoは環境変数で上書き可）
const LW_BOT_NO = process.env.LW_BOT_NO ?? "6807751";
const worksFileDownloadUrl = (botNo: string, channelId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${botNo}/channels/${channelId}/files/${fileId}`;

// （任意）厳密PDF判定を有効化するフラグ：trueならWorks APIにHEAD/GETしてContent-Type確認
const STRICT_PDF = (process.env.LW_STRICT_PDF ?? "false").toLowerCase() === "true";
// Works APIのトークン（STRICT_PDF=trueのときに使用）
const WORKS_API_TOKEN = process.env.WORKS_API_TOKEN ?? "";

// ---------- ユーティリティ ----------
const isUuid = (s: string | null | undefined): s is string =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** Works APIでContent-Typeを確認（STRICT_PDF=trueのときのみ使用） */
async function confirmPdfByHead(url: string): Promise<{ ok: boolean; mime: string | null }> {
  if (!STRICT_PDF) return { ok: true, mime: null };
  if (!WORKS_API_TOKEN) return { ok: true, mime: null }; // トークン未設定なら通す

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WORKS_API_TOKEN}` },
    });
    const mime = res.headers.get("content-type");
    const ok = !!mime && mime.toLowerCase().includes("application/pdf");
    return { ok, mime: mime ?? null };
  } catch {
    // エラー時は除外せず通す（必要なら false に変更）
    return { ok: true, mime: null };
  }
}

/**
 * 指定チャンネルの msg_lw_log から「file_id あり」（= 添付あり）の行だけを抽出し、
 * RPA リクエストに status="approved" で登録する。
 * - 重複排除：rpa_command_requests で (template_id, channel_id, message_id) が既に存在するものを除外
 */
export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;         // timestamp >= since
  until?: string;         // timestamp <= until
  pageSize?: number;      // 既定 5000
}): Promise<DispatchResult> {
  const channelId =
    input?.channelId ?? process.env.TARGET_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;

  const templateId =
    input?.templateId ?? process.env.RPA_TEMPLATE_ID ?? DEFAULT_TEMPLATE_ID;

  const since = input?.since;
  const until = input?.until;
  const pageSize = input?.pageSize ?? 5000;

  // 1) 添付ありのメッセージを取得
  let q = supabase
    .from(MESSAGES_TABLE)
    .select(
      "id,timestamp,event_type,user_id,channel_id,domain_id,message,file_id,members,status"
    )
    .eq("channel_id", channelId)
    .not("file_id", "is", null);

  if (since) q = q.gte("timestamp", since);
  if (until) q = q.lte("timestamp", until);

  const { data, error } = await q.limit(pageSize);
  if (error) {
    const details = typeof error === "object" ? JSON.stringify(error) : String(error);
    throw new Error(`select from ${MESSAGES_TABLE} failed: ${details}`);
  }

  const rows: MsgRow[] = Array.isArray(data) ? (data as MsgRow[]) : [];
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // 2) RPAへ流すペイロードを作成（まず全候補）
  const allCandidates: RpaInsertRow[] = [];
  for (const r of rows) {
    if (!r.file_id) continue;

    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);
    const pdfCheck = await confirmPdfByHead(fileUrl);
    if (!pdfCheck.ok) continue;

    const requester = isUuid(r.user_id) ? r.user_id : null; // schema に合わないIDは null に退避

    allCandidates.push({
      template_id: templateId,
      requester_id: requester,
      status: "approved",
      request_details: {
        source: "lineworks_channel_pdf",
        channel_id: r.channel_id,
        message_id: String(r.id),
        uploader_user_id: r.user_id,
        file_url: fileUrl,
        file_mime: pdfCheck.mime,
        file_name: null,
        uploaded_at: r.timestamp ?? null,
        file_id: r.file_id,
        download_url: fileUrl,
      },
      // requested_at は DB 側 default now() があるので省略可（必要なら new Date().toISOString()）
    });
  }

  if (allCandidates.length === 0) return { inserted: 0, skipped: 0 };

  // 3) 既存の同一案件（template_id + channel_id + message_id）を検索して除外
  // JSONB のキーを使ってフィルタ可能： request_details->>message_id / ->>channel_id
  const messageIds = allCandidates.map(c => c.request_details.message_id);
  // Supabase の in 演算子は 1000 個制限に注意。件数が多い場合は分割して実行してください。
  const { data: existing, error: existErr } = await supabase
    .from(RPA_TABLE)
    .select("id, request_details")
    .eq("template_id", templateId)
    .eq("request_details->>channel_id", channelId)
    .in("request_details->>message_id", messageIds);

  if (existErr) {
    const details = typeof existErr === "object" ? JSON.stringify(existErr) : String(existErr);
    throw new Error(`select existing from ${RPA_TABLE} failed: ${details}`);
  }

  const existingMsgIdSet = new Set(
    (existing ?? [])
      .map(r => (r as { request_details?: { message_id?: string } }).request_details?.message_id)
      .filter((x): x is string => typeof x === "string")
  );

  const payloads: RpaInsertRow[] = allCandidates.filter(
    c => !existingMsgIdSet.has(c.request_details.message_id)
  );

  if (payloads.length === 0) {
    return { inserted: 0, skipped: allCandidates.length };
  }

  // 4) INSERT（onConflict は使わない：既存除外したため）
  const { data: ins, error: insErr } = await supabase
    .from(RPA_TABLE)
    .insert(payloads)
    .select("id");

  if (insErr) {
    const details = typeof insErr === "object" ? JSON.stringify(insErr) : String(insErr);
    throw new Error(`insert into ${RPA_TABLE} failed: ${details}`);
  }

  const inserted = Array.isArray(ins) ? ins.length : 0;
  const skipped = allCandidates.length - inserted;
  return { inserted, skipped };
}
