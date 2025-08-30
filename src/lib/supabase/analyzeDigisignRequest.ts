//"C:\Users\USER\famille_shift_matching\src\lib\supabase\analyzeDigisignRequest.ts"
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

// -----------------------------
// 型定義
// -----------------------------
export type MessageRow = {
    channel_id: string;
    message_id: string;
    user_id: string; // 添付したユーザー
    text?: string | null;
    created_at?: string | null;
    attachments?: Array<{
        url?: string | null;
        mimeType?: string | null;
        fileName?: string | null;
        uploaded_at?: string | null;
    }>;
};

// -----------------------------
// 共通ユーティリティ
// -----------------------------
const isPdf = (url?: string | null, mime?: string | null, name?: string | null) => {
    const m = (mime || "").toLowerCase();
    if (m.includes("application/pdf")) return true;
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

// -----------------------------
// Digisign 用既存関数（例）
// -----------------------------
export async function analyzeDigisignRequest() {
    // TODO: 既存の Digisign 関連処理をここに残す
    // supabaseAdmin を使って request を抽出・RPA登録
    return { ok: true };
}

// -----------------------------
// LINE WORKS: PDF添付を抽出してRPA登録
// -----------------------------
export async function extractPdfFromChannelAndDispatchRPA(opts: {
    channelId: string; // 例: "a134fad8-e459-4ea3-169d-be6f5c0a6aad"
    since?: string; // ISO文字列 (省略可)
    until?: string; // ISO文字列 (省略可)
    messagesTable?: string; // 例: "msg_lw_log_with_group_account_rows"
    rpaTable?: string; // 例: "rpa_command_requests"
    templateId?: string; // 省略時は固定UUID
}) {
    const MESSAGES = opts.messagesTable ?? "msg_lw_log_with_group_account_rows";
    const RPA = opts.rpaTable ?? "rpa_command_requests";
    const TEMPLATE_ID = opts.templateId ?? "5c623c6e-c99e-4455-8e50-68ffd92aa77a";

    // 1) メッセージ取得
    let q = supabase
        .from(MESSAGES)
        .select("channel_id,message_id,user_id,text,created_at,attachments")
        .eq("channel_id", opts.channelId);

    if (opts.since) q = q.gte("created_at", opts.since);
    if (opts.until) q = q.lte("created_at", opts.until);

    const { data: rows, error } = await q;
    if (error) throw error;

    // 2) PDF抽出
    type RpaUpsertPayload = {
        template_id: string;
        requester_id: string;
        status: "approved";
        original_message_id: string;
        file_url: string;
        request_details: Record<string, unknown>;
    };

    const payloads: RpaUpsertPayload[] = [];
    for (const r of (rows ?? []) as MessageRow[]) {
        const atts = Array.isArray(r.attachments) ? r.attachments : [];
        for (const a of atts) {
            if (!a?.url) continue;
            if (!isPdf(a.url, a.mimeType, a.fileName)) continue;

            payloads.push({
                template_id: TEMPLATE_ID,
                requester_id: r.user_id,
                status: "approved" as const,
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

    if (payloads.length === 0) return { inserted: 0, skipped: 0 };

    // 3) RPAリクエストへ UPSERT
    const { data: ins, error: insErr } = await supabase
        .from(RPA)
        .upsert(payloads, {
            onConflict: "template_id,original_message_id,file_url",
            ignoreDuplicates: true,
        })
        .select("id");

    if (insErr) throw insErr;

    const inserted = ins?.length ?? 0;
    const skipped = payloads.length - inserted;
    return { inserted, skipped };
}
