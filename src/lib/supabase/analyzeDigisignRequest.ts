// ======================================================
// analyzeDigisignRequest.ts（const修正・Lint対応）
// LINE WORKS: msg_lw_log から「PDF 添付（= file_id あり）」を抽出し、
// rpa_command_requests に status="approved" で登録する。
// - 直近1日のみ処理（既定）
// - msg_lw_log.status を更新（2:一次処理終了, 9:完了, 1:保留）
// - requester_id(NotNull) 対策：LINE WORKS user_id→UUID マッピング解決
// - PostgREST: JSONB 検索で重複排除
// ======================================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// ---------- 型 ----------
export type MsgRow = {
  id: number;
  timestamp: string | null;
  event_type?: string | null;
  user_id: string;        // LINE WORKS 側ユーザーID（UUIDとは限らない）
  channel_id: string;
  domain_id?: string | null;
  message?: string | null;
  file_id: string | null; // 添付があると入る
  members?: unknown;
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
  requester_id: string;           // uuid 文字列（NotNull）
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

// マッピングテーブル（LINE WORKS user_id → requester_id(uuid)）
const REQUESTER_MAP_TABLE = process.env.LW_REQUESTER_MAP_TABLE ?? "rpa_requester_map";
// マッピング見つからない時の方針: "error" | "skip" | "fallback"
const MISSING_REQUESTER_POLICY = (
  process.env.MISSING_REQUESTER_POLICY ?? "skip"
).toLowerCase() as "error" | "skip" | "fallback";
const RPA_FALLBACK_REQUESTER_ID = process.env.RPA_FALLBACK_REQUESTER_ID ?? "";

// Line Works Files API URLを組み立て（botNoは環境変数で上書き可）
const LW_BOT_NO = process.env.LW_BOT_NO ?? "6807751";
const worksFileDownloadUrl = (botNo: string, channelId: string, fileId: string) =>
  `https://www.worksapis.com/v1.0/bots/${botNo}/channels/${channelId}/files/${fileId}`;

// （任意）厳密PDF判定を有効化：true なら Works API に HEAD して Content-Type 確認
const STRICT_PDF = (process.env.LW_STRICT_PDF ?? "false").toLowerCase() === "true";
const WORKS_API_TOKEN = process.env.WORKS_API_TOKEN ?? ""; // STRICT_PDF 時に使用

// ---------- ユーティリティ ----------
const isUuid = (s: string | null | undefined): s is string =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** Works APIでContent-Typeを確認（STRICT_PDF=true のときのみ使用） */
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

/** LINE WORKS user_id から requester_id(uuid) を解決 */
async function resolveRequesterUuid(lwUserId: string): Promise<string | null> {
  // 1) UUID ならそのまま採用
  if (isUuid(lwUserId)) return lwUserId;

  // 2) マッピング表で解決
  const { data, error } = await supabase
    .from(REQUESTER_MAP_TABLE)
    .select("requester_id")
    .eq("lineworks_user_id", lwUserId)
    .maybeSingle();

  if (!error && data?.requester_id) return data.requester_id as string;

  // 3) 方針
  if (MISSING_REQUESTER_POLICY === "fallback" && RPA_FALLBACK_REQUESTER_ID) {
    return RPA_FALLBACK_REQUESTER_ID;
  }
  if (MISSING_REQUESTER_POLICY === "error") {
    throw new Error(
      `requester_id mapping not found for lineworks_user_id=${lwUserId} in ${REQUESTER_MAP_TABLE}`
    );
  }
  // "skip"
  return null;
}

/**
 * 指定チャンネルの msg_lw_log から「file_id あり」（= 添付あり）の行だけを抽出し、
 * RPA リクエストに status="approved" で登録する。
 * - 重複排除：rpa_command_requests で (template_id, channel_id, message_id) が既に存在するものを除外
 * - 直近1日のみ（since/until で上書き可）
 * - 処理後に msg_lw_log.status を更新（2:一次処理終了, 9:完了, 1:保留）
 */
export async function dispatchLineworksPdfToRPA(input?: {
  channelId?: string;
  templateId?: string;
  since?: string;   // timestamp >= since
  until?: string;   // timestamp <= until
  pageSize?: number;
}): Promise<DispatchResult> {
  const channelId =
    input?.channelId ?? process.env.TARGET_CHANNEL_ID ?? DEFAULT_CHANNEL_ID;
  const templateId =
    input?.templateId ?? process.env.RPA_TEMPLATE_ID ?? DEFAULT_TEMPLATE_ID;

  // 直近1日のデフォルト期間
  const now = new Date();
  const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since = input?.since ?? oneDayAgoIso;
  const until = input?.until ?? now.toISOString();

  const pageSize = input?.pageSize ?? 5000;

  // 1) 直近1日・未判定(status=0)・添付あり(file_id IS NOT NULL)のメッセージを取得
  const q = supabase
    .from(MESSAGES_TABLE)
    .select("id,timestamp,event_type,user_id,channel_id,domain_id,message,file_id,members,status")
    .eq("channel_id", channelId)
    .not("file_id", "is", null)
    .eq("status", 0)
    .gte("timestamp", since)
    .lte("timestamp", until)
    .order("timestamp", { ascending: true });

  const { data, error } = await q.limit(pageSize);
  if (error) {
    const details = typeof error === "object" ? JSON.stringify(error) : String(error);
    throw new Error(`select from ${MESSAGES_TABLE} failed: ${details}`);
  }

  const rows: MsgRow[] = Array.isArray(data) ? (data as MsgRow[]) : [];
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // 2) RPAへ流す候補の作成
  const allCandidates: RpaInsertRow[] = [];
  const msgIdMissingRequester: number[] = []; // requester マッピング無し（保留=1）
  const msgIdNotPdf: number[] = [];           // STRICT_PDF でPDFでなかった（保留=1）

  for (const r of rows) {
    if (!r.file_id) continue; // 念のため

    const fileUrl = worksFileDownloadUrl(LW_BOT_NO, r.channel_id, r.file_id);
    const pdfCheck = await confirmPdfByHead(fileUrl);
    if (!pdfCheck.ok) {
      msgIdNotPdf.push(r.id);
      continue;
    }

    // requester_id は UUID 必須 → マッピング表で解決
    const requesterUuid = await resolveRequesterUuid(r.user_id);
    if (!requesterUuid) {
      msgIdMissingRequester.push(r.id);
      continue;
    }

    allCandidates.push({
      template_id: templateId,
      requester_id: requesterUuid,
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
    });
  }

  // 2.5) 既存重複（template_id + channel_id + message_id）を除外
  const candidatesMsgIds = allCandidates.map(c => c.request_details.message_id);
  let existingMsgIdSet = new Set<string>();
  if (candidatesMsgIds.length > 0) {
    const { data: existing, error: existErr } = await supabase
      .from(RPA_TABLE)
      .select("id, request_details")
      .eq("template_id", templateId)
      .eq("request_details->>channel_id", channelId)
      .in("request_details->>message_id", candidatesMsgIds);

    if (existErr) {
      const details = typeof existErr === "object" ? JSON.stringify(existErr) : String(existErr);
      throw new Error(`select existing from ${RPA_TABLE} failed: ${details}`);
    }

    existingMsgIdSet = new Set(
      (existing ?? [])
        .map(r => (r as { request_details?: { message_id?: string } }).request_details?.message_id)
        .filter((x): x is string => typeof x === "string")
    );
  }

  const payloads = allCandidates.filter(
    c => !existingMsgIdSet.has(c.request_details.message_id)
  );

  // 3) INSERT（payloadsのみ）・ステータス更新用のID群を用意
  let inserted = 0;
  const insertedMsgIds: number[] = [];  // status=2 にするID
  const dupMsgIds: number[] = [];       // status=9 にするID

  // 既存重複分は完了扱い
  for (const c of allCandidates) {
    if (existingMsgIdSet.has(c.request_details.message_id)) {
      dupMsgIds.push(Number(c.request_details.message_id));
    }
  }

  if (payloads.length > 0) {
    const { data: ins, error: insErr } = await supabase
      .from(RPA_TABLE)
      .insert(payloads)
      .select("id");

    if (insErr) {
      const details = typeof insErr === "object" ? JSON.stringify(insErr) : String(insErr);
      throw new Error(`insert into ${RPA_TABLE} failed: ${details}`);
    }

    inserted = Array.isArray(ins) ? ins.length : 0;
    insertedMsgIds.push(
      ...payloads.map(p => Number(p.request_details.message_id))
    );
  }

  // 4) msg_lw_log のステータス更新
  //  - INSERT 成功 → status=2（一次処理終了）
  //  - 既存重複 → status=9（完了）
  //  - requester 不明 or 非PDF（STRICT時） → status=1（保留）

  if (insertedMsgIds.length > 0) {
    await supabase.from(MESSAGES_TABLE)
      .update({ status: 2 })
      .in("id", insertedMsgIds);
  }

  if (dupMsgIds.length > 0) {
    await supabase.from(MESSAGES_TABLE)
      .update({ status: 9 })
      .in("id", dupMsgIds);
  }

  const holdIds = [...msgIdMissingRequester, ...msgIdNotPdf];
  if (holdIds.length > 0) {
    await supabase.from(MESSAGES_TABLE)
      .update({ status: 1 })
      .in("id", holdIds);
  }

  const processed = insertedMsgIds.length + dupMsgIds.length + holdIds.length;
  const skipped = Math.max(0, rows.length - processed);
  return { inserted, skipped };
}
