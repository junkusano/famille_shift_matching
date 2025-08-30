// ======================================================
// /api/cron/dispatch-rpa-from-digisign-request/route.ts
// 目的:
//  - 指定LINE WORKSチャンネルの「PDF添付のみ」を抽出
//  - rpa_command_requests に "approved" でUPSERT登録
// 備考:
//  - ロジック本体は /src/lib/supabase/dispatchPdfFromChannel.ts を利用
//  - 認証は Bearer ${CRON_SECRET} で自己完結（cronAuth は未使用）
//  - 期間絞りは ?since=YYYY-MM-DD&until=YYYY-MM-DD をサポート
//  - channelId / templateId は .env もしくはクエリで上書き可
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { dispatchPdfFromChannel } from "@/lib/supabase/dispatchPdfFromChannel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 既定値（.env で上書き可）
const DEFAULT_CHANNEL_ID = "a134fad8-e459-4ea3-169d-be6f5c0a6aad";
const DEFAULT_TEMPLATE_ID = "5c623c6e-c99e-4455-8e50-68ffd92aa77a";

// --- シンプルな認証（既存cronと同等の想定） ---
function verifyCronAuth(req: NextRequest): boolean {
    const bearer = req.headers.get("authorization") || "";
    const secret = process.env.CRON_SECRET || "";
    return !!secret && bearer === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!verifyCronAuth(req)) {
        return new NextResponse("unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const since = url.searchParams.get("since") || undefined;
    const until = url.searchParams.get("until") || undefined;

    // クエリ or .env で上書き可（検証運用向け）
    const channelId =
        url.searchParams.get("channelId") ||
        process.env.TARGET_CHANNEL_ID ||
        DEFAULT_CHANNEL_ID;

    const templateId =
        url.searchParams.get("templateId") ||
        process.env.RPA_TEMPLATE_ID ||
        DEFAULT_TEMPLATE_ID;

    try {
        const result = await dispatchPdfFromChannel({
            channelId,
            templateId,
            since,
            until,
            // messagesTable: "msg_lw_log_with_group_account_rows", // 変更したい場合のみ指定
            // rpaTable: "rpa_command_requests",                      // デフォルトでOK
        });

        return NextResponse.json({
            ok: true,
            channelId,
            templateId,
            since: since ?? null,
            until: until ?? null,
            inserted: result.inserted,
            skipped: result.skipped,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[cron] dispatch-rpa-from-digisign-request error:", e);
        return new NextResponse(`error: ${msg}`, { status: 500 });
    }
}

export const POST = GET;
