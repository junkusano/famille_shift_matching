// ======================================================
// analyzeDigisignRequest.ts
// 目的：LINE WORKSトーク（msg_lw_log）から「PDF添付のみ」を抽出し、
//       rpa_command_requests に status="approved" でUPSERT登録する。
// 備考：Supabase呼び出しは本ファイルで完結。cronはこの関数を呼ぶだけ。
// ======================================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// ---------- 型 ----------
export type MsgRow = {
  id: number;
  timestamp: string | null;
  event_type: string | null;
  user_id: string;        // 申請者
  channel_id: string;
  domain_id: string | null;
  message: string | null; // URLなどが入る場合あり（空のことも多い）
  file_id: string | null; // 添付がある場合に入る（LWのファイルID）
  members: unknown;
  status: number | null;
};

export type RequestDetails = {
  source: "lineworks_channel_pdf";
  channel_id: string;
  message_id: string;         // msg_lw_log.id を文字列で
  uploader_user_id: string;
  file_url: string;           // RPAが直接取得に使うURL
  file_mime: string | null;   // 厳密判定時にContent-Typeを入れる
  file_name: string | null;   // わかれば設定（通常null）
  uploaded_at: string | null; // msg_lw_log.timestamp
  file_id?: string | null;    // LWのfile_idも残す（後工程用）
  download_url?: string | null;
};

export type RpaPayload = {
  template_id: string;
  requester_id: string;
  status: "approved";
  original_message_id: string;
  file_url: string;
  request_details: RequestDetails;
};

export type DispatchResult = { inserted: number; skipped: number };

// ---------- 設定 ----------
const DEFAULT_CHANNEL_ID = "a134fad8-e459-4ea3-169d-be6f5c0a6aad";
const DEFAULT_TEMPLATE_ID = "5c623c6e-c99e-4455-8e50-68ffd92aa77a";
const MESSAGES_TABLE_DEFAULT = "msg_lw_log";
const RPA_TABLE_DEFAULT = "rpa_command_requests";

// Line Works Files API URLを組み立て（botNoは環境変数で上書き可）
const LW_BOT_NO = process.env.LW_BOT_NO ?? "6807751";
const worksFileDownloadUrl = (botNo: string, channelId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${botNo}/channels/${channelId}/files/${fileId}`;

// （任意）厳密PDF判定を有効化するフラグ：trueならWorks APIにHEAD/GETしてContent-Type確認
const STRICT_PDF = (process.env.LW_STRICT_PDF ?? "false").toLowerCase() === "true";
// Works APIのトークン（サービスアカウントなど）。STRICT_PDF=trueのときに使用。
const WORKS_API_TOKEN = process.env.WORKS_API_TOKEN ?? "";

// ---------- ユーティリティ ----------
/** Works APIでContent-Typeを確認（STRICT_PDF=trueのときのみ使用） */
async function confirmPdfByHead(url: string): Promise<{ ok: boolean; mime: string | null }> {
  if (!STRICT_PDF) return { ok: true, mime: null };
  if (!WORKS_API_TOKEN) return { ok: true, mime: null }; // トークン未設定時はスキップ（緩め）

  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WORKS_API_TOKEN}` },
    });
    const mime = res.headers.get("content-type");
    const ok = !!mime && mime.toLowerCase().includes("application/pdf");
    return { ok, mime: mime ?? null };
  } catch {
    // 取得失敗時は除外せず通す（運用に応じて false にしても良い）
    return { ok: true, mime: null };
  }
}

// ---------- 本体：LINE WORKS PDF → RPA登録 ----------
export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;            // 絞り込み（timestamp >= since）
  until?: string;            // 絞り込み（timestamp <= until）
  messagesTable?: string;    // 既定 msg_lw_log
  rpaTable?: string;         // 既定 rpa_command_requests
  pageSize?: number;         // 既定 5000
}): Promise<DispatchResult> {
  const channelId =
    input?.channelId ?? process.env.TARGET_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;

  const templateId =
    input?.templateId ?? process.env.RPA_TEMPLATE_ID ?? DEFAULT_TEMPLATE_ID;

  const messagesTable = input?.messagesTable ?? MESSAGES_TABLE_DEFAULT;
  const rpaTable = input?.rpaTable ?? RPA_TABLE_DEFAULT;
  const since = input?.since;
  const until = input?.until;
  const pageSize = input?.pageSize ?? 5000;

  // 1) 対象メッセージ取得（file_idがNULLでない＝添付あり）
  let q = supabase
    .from(messagesTable)
    .select(
      "id,timestamp,event_type,user_id,channel_id,domain_id,message,file_id,members,status"
    )
    .eq("channel_id", channelId)
    .not("file_id", "is", null); // 添付ありに限定

  if (since) q = q.gte("timestamp", since);
  if (until) q = q.lte("timestamp", until);

  const { data, error } = await q.limit(pageSize);
  if (error) {
    const details = typeof error === "object" ? JSON.stringify(error) : String(error);
    throw new Error(`select from ${messagesTable} failed: ${details}`);
  }

  const rows: MsgRow[] = Array.isArray(data) ? (data as MsgRow[]) : [];
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // 2) PDFのみ抽出（必要に応じてContent-Typeを確認）
  const payloads: RpaPayload[] = [];
  for (const r of rows) {
    if (!r.file_id) continue;

    // Line Worksファイルの取得URL（RPA側でダウンロードに使う）
    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);

    // 厳密チェック（任意）：Content-Type が application/pdf か確認
    const pdfCheck = await confirmPdfByHead(fileUrl);
    if (!pdfCheck.ok) continue;

    payloads.push({
      template_id: templateId,
      requester_id: r.user_id,                 // 添付ユーザー＝申請者
      status: "approved",
      original_message_id: String(r.id),       // 幂等キーの一部
      file_url: fileUrl,
      request_details: {
        source: "lineworks_channel_pdf",
        channel_id: r.channel_id,
        message_id: String(r.id),
        uploader_user_id: r.user_id,
        file_url: fileUrl,
        file_mime: pdfCheck.mime,              // 確認できたら格納（通常nullでもOK）
        file_name: null,
        uploaded_at: r.timestamp ?? null,
        file_id: r.file_id,
        download_url: fileUrl,
      },
    });
  }

  if (payloads.length === 0) return { inserted: 0, skipped: 0 };

  // 3) RPAテーブルにUPSERT（重複防止：template_id, original_message_id, file_url）
  const { data: upData, error: upError } = await supabase
    .from(rpaTable)
    .upsert(payloads, {
      onConflict: "template_id,original_message_id,file_url",
      ignoreDuplicates: true,
    })
    .select("id");

  if (upError) {
    const details = typeof upError === "object" ? JSON.stringify(upError) : String(upError);
    throw new Error(`upsert into ${rpaTable} failed: ${details}`);
  }

  const inserted = Array.isArray(upData) ? upData.length : 0;
  const skipped = payloads.length - inserted;
  return { inserted, skipped };
}

// ---------- （既存のDigiサイン処理があるならこの下に保持） ----------
// export async function analyzeDigisignRequest() { ... }
