// ==========================================
// /src/lib/supabase/dispatchPdfFromChannel.ts
// - LINE WORKS: msg_lw_log から PDF 添付だけ抽出
// - rpa_command_requests へ status="approved" でUPSERT
// - Supabase 呼び出しは lib 内で完結（cron は呼ぶだけ）
// ==========================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// ====== ドメイン型 ======
export type MessageRow = {
    id: number;                 // msg_lw_log.id
    timestamp: string | null;   // timestamptz
    event_type: string | null;
    user_id: string;            // 申請者に利用
    channel_id: string;         // 対象チャンネル
    domain_id: string | null;
    message: string | null;     // Drive URL 等が含まれる可能性あり
    file_id: string | null;     // Drive 風のIDが入る場合あり
    members: unknown;           // 使わない
    status: number | null;
};

export type RequestDetails = {
    source: "lineworks_channel_pdf";
    channel_id: string;
    message_id: string;         // msg_lw_log.id を文字列化
    uploader_user_id: string;
    file_url: string;
    file_mime: string | null;   // 判定困難なため通常 null
    file_name: string | null;   // 抽出できればセット
    uploaded_at: string | null; // timestamp
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

// ====== ユーティリティ ======

// Google Drive の fileId を抽出（/d/<id> か ?id=<id>）
const extractDriveFileId = (text: string): string | null => {
    const m = text.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/);
    return m ? m[1] : null;
};

// URL文字列から拡張子を推定
const endsWithPdf = (u?: string | null): boolean =>
    !!u && /\.pdf(\?|#|$)/i.test(u);

// Drive の閲覧/ダウンロード URL を生成
/*
const toDrivePreviewUrl = (id: string) =>
    `https://drive.google.com/file/d/${id}/preview`;
const toDriveViewUrl = (id: string) =>
    `https://drive.google.com/uc?export=view&id=${id}`;
*/
const toDriveDownloadUrl = (id: string) =>
    `https://drive.google.com/uc?export=download&id=${id}`;

// file_id が Drive 風（25+桁英数ハイフン/アンダースコア）か
const isDriveLikeId = (s?: string | null) =>
    !!s && /^[-\w]{25,}$/.test(s);

// PDF かの総合判定
const looksPdf = (message?: string | null, fileIdGuess?: string | null): boolean => {
    if (message && endsWithPdf(message)) return true;
    // fileId だけでは PDF 断定不可だが、要件が「PDF添付のみ」なので
    // messageにURLがあり.pdf終端なら採用、file_idのみの場合は“Drive想定”で採用するかは方針次第
    // ここでは「file_idがあり、message内にURLがなくても採用」方針（※必要なら切替可）
    if (isDriveLikeId(fileIdGuess)) return true;
    return false;
};

// message から URL とファイル名っぽいものを抽出（最初のURLを対象）
const extractFirstUrlAndName = (text?: string | null): { url: string | null; name: string | null } => {
    if (!text) return { url: null, name: null };
    const urlMatch = text.match(/https?:\/\/[^\s<>")]+/i);
    const url = urlMatch ? urlMatch[0] : null;

    // 簡易的に末尾の /name.pdf を拾う（URLでない場合は null）
    let name: string | null = null;
    if (url) {
        const nm = url.match(/\/([^\/?#]+\.pdf)(?:[?#]|$)/i);
        name = nm ? nm[1] : null;
    }
    return { url, name };
};

// ====== 本体 ======
/**
 * msg_lw_log から PDF 添付を抽出 → rpa_command_requests に UPSERT
 * @param input.channelId 対象チャンネル（省略時: env または固定）
 * @param input.templateId RPAテンプレ（省略時: 固定UUID）
 * @param input.since/ until 期間絞り（timestamp に対して >= / <=）
 * @param input.messagesTable 既定 "msg_lw_log"
 * @param input.rpaTable 既定 "rpa_command_requests"
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
    const messagesTable = input?.messagesTable ?? "msg_lw_log";
    const rpaTable = input?.rpaTable ?? "rpa_command_requests";
    const pageSize = input?.pageSize ?? 5000;

    // 1) 取得（msg_lw_log 固定）
    let q = supabase
        .from(messagesTable)
        .select("id,timestamp,event_type,user_id,channel_id,domain_id,message,file_id,members,status")
        .eq("channel_id", channelId);

    if (since) q = q.gte("timestamp", since);
    if (until) q = q.lte("timestamp", until);

    const { data, error } = await q.limit(pageSize);
    if (error) {
        const details = typeof error === "object" ? JSON.stringify(error) : String(error);
        throw new Error(`select from ${messagesTable} failed: ${details}`);
    }

    const rows: MessageRow[] = Array.isArray(data) ? (data as MessageRow[]) : [];
    if (rows.length === 0) return { inserted: 0, skipped: 0 };

    // 2) PDF抽出 & URL生成
    const payloads: RpaUpsertPayload[] = [];
    for (const r of rows) {
        // message に URL があるか先に見る
        const { url: urlInMsg, name: nameInMsg } = extractFirstUrlAndName(r.message ?? undefined);
        const driveIdFromMsg = urlInMsg ? extractDriveFileId(urlInMsg) : null;
        const driveId = driveIdFromMsg || (isDriveLikeId(r.file_id) ? r.file_id : null);

        // PDFっぽさチェック（messageの拡張子 or driveId存在）
        if (!looksPdf(urlInMsg, driveId)) continue;

        // file_url を決定（Drive優先。なければ message 内のURLをそのまま）
        let fileUrl: string | null = null;
        if (driveId) {
            // RPAで扱いやすい download/view/preview のどれか
            fileUrl = toDriveDownloadUrl(driveId); // or toDriveViewUrl(driveId) / toDrivePreviewUrl(driveId)
        } else {
            fileUrl = urlInMsg; // 非Drive URL（.pdf 終端）をそのまま利用
        }
        if (!fileUrl) continue;

        payloads.push({
            template_id: templateId,
            requester_id: r.user_id,
            status: "approved",
            original_message_id: String(r.id),
            file_url: fileUrl,
            request_details: {
                source: "lineworks_channel_pdf",
                channel_id: r.channel_id,
                message_id: String(r.id),
                uploader_user_id: r.user_id,
                file_url: fileUrl,
                file_mime: null,                     // 判別困難なので null（必要なら将来拡張）
                file_name: nameInMsg ?? null,        // 取れたときだけ
                uploaded_at: r.timestamp ?? null,
            },
        });
    }

    if (payloads.length === 0) return { inserted: 0, skipped: 0 };

    // 3) UPSERT（template_id, original_message_id, file_url で一意）
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
