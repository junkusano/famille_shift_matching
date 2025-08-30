// ==========================================
// /src/lib/supabase/dispatchPdfFromChannel.ts
// - LINE WORKSのメッセージログから PDF 添付のみ抽出
// - rpa_command_requests に "approved" でUPSERT登録
// - Supabaseクライアントは supabaseAdmin を統一利用
// ==========================================

import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// ------- 型定義（必要に応じて環境の実テーブルに合わせて調整） -------
export type MessageRow = {
    channel_id: string;
    message_id: string;
    user_id: string;              // 添付したユーザー
    text?: string | null;
    created_at?: string | null;
    attachments?: Array<{
        url?: string | null;
        mimeType?: string | null;
        fileName?: string | null;
        uploaded_at?: string | null;
    }>;
};

export type RpaUpsertPayload = {
    template_id: string;
    requester_id: string;
    status: "approved";
    original_message_id: string;
    file_url: string;
    request_details: Record<string, unknown>;
};

// ------- ユーティリティ -------
const isPdf = (url?: string | null, mime?: string | null, name?: string | null) => {
    const m = (mime || "").toLowerCase();
    if (m.includes("application/pdf") || m === "pdf") return true;
    const u = (url || "").toLowerCase();
    if (u.endsWith(".pdf")) return true;
    const n = (name || "").toLowerCase();
    if (n.endsWith(".pdf")) return true;
    return false;
};

const buildDetails = (args: {
    channel_id: string;
    message_id: string;
    uploader_user_id: string;
    file_url: string;
    file_mime?: string | null;
    file_name?: string | null;
    uploaded_at?: string | null;
}) => ({
    source: "lineworks_channel_pdf",
    channel_id: args.channel_id,
    message_id: args.message_id,
    uploader_user_id: args.uploader_user_id,
    file_url: args.file_url,
    file_mime: args.file_mime ?? null,
    file_name: args.file_name ?? null,
    uploaded_at: args.uploaded_at ?? null,
});

// ------- 本体関数 -------
/**
 * 指定チャンネルのメッセージから「PDF添付のみ」を抽出し、
 * rpa_command_requests に "approved" でUPSERT登録します。
 *
 * - 重複防止キー: (template_id, original_message_id, file_url)
 * - templateId 省略時は要件の固定UUIDを使用
 *
 * @returns { inserted, skipped }
 */
export async function dispatchPdfFromChannel(opts: {
    channelId: string;                 // 例: "a134fad8-e459-4ea3-169d-be6f5c0a6aad"
    templateId?: string;               // 省略可（固定UUIDデフォルト）
    since?: string;                    // 省略可（ISO）期間絞り
    until?: string;                    // 省略可（ISO）
    messagesTable?: string;            // 既定: "msg_lw_log_with_group_account_rows"
    rpaTable?: string;                 // 既定: "rpa_command_requests"
    pageSize?: number;                 // 既定: 5000（必要ならページング実装へ拡張）
}) {
    const {
        channelId,
        since,
        until,
        templateId = "5c623c6e-c99e-4455-8e50-68ffd92aa77a",
        messagesTable = "msg_lw_log_with_group_account_rows",
        rpaTable = "rpa_command_requests",
        pageSize = 5000,
    } = opts;

    // 1) メッセージ取得（環境のスキーマに合わせてselect句を調整）
    let q = supabase
        .from(messagesTable)
        .select("channel_id,message_id,user_id,text,created_at,attachments")
        .eq("channel_id", channelId);

    if (since) q = q.gte("created_at", since);
    if (until) q = q.lte("created_at", until);

    const { data: rows, error } = await q.limit(pageSize);
    if (error) throw error;

    // 2) PDF添付のみ抽出 → RPA用ペイロードへ変換
    const payloads: RpaUpsertPayload[] = [];
    for (const r of (rows ?? []) as MessageRow[]) {
        const atts = Array.isArray(r.attachments) ? r.attachments : [];
        for (const a of atts) {
            if (!a?.url) continue;
            if (!isPdf(a.url, a.mimeType, a.fileName)) continue;

            payloads.push({
                template_id: templateId,
                requester_id: r.user_id, // 添付者を申請者へ
                status: "approved",
                original_message_id: r.message_id,
                file_url: a.url,
                request_details: buildDetails({
                    channel_id: r.channel_id,
                    message_id: r.message_id,
                    uploader_user_id: r.user_id,
                    file_url: a.url!,
                    file_mime: a.mimeType ?? null,
                    file_name: a.fileName ?? null,
                    uploaded_at: a.uploaded_at ?? r.created_at ?? null,
                }),
            });
        }
    }

    if (payloads.length === 0) {
        return { inserted: 0, skipped: 0 };
    }

    // 3) UPSERT（template_id, original_message_id, file_url で一意）
    const { data: ins, error: upErr } = await supabase
        .from(rpaTable)
        .upsert(payloads, {
            onConflict: "template_id,original_message_id,file_url",
            ignoreDuplicates: true,
        })
        .select("id");

    if (upErr) throw upErr;

    const inserted = ins?.length ?? 0;
    const skipped = payloads.length - inserted;
    return { inserted, skipped };
}
