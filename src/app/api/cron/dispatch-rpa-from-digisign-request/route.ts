// ======================================================
// /api/cron/dispatch-rpa-from-digisign-request/route.ts
// 参考ルート：cronはlibを1行呼ぶだけ。Supabaseは触らない。
// 認証：CRON_SECRET が未設定なら通す。設定時は Bearer / ?secret= どちらでも可。
// クエリ：?since= / ?until= / ?channelId= / ?templateId= で上書き可能。
// ======================================================

import { NextRequest, NextResponse } from "next/server";
import { dispatchLineworksPdfToRPA } from "@/lib/supabase/analyzeDigisignRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ok(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true;
  const bearer = req.headers.get("authorization") || "";
  if (bearer === `Bearer ${secret}`) return true;
  const q = new URL(req.url).searchParams.get("secret");
  return q === secret;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return new NextResponse("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since") || undefined;
  const until = url.searchParams.get("until") || undefined;
  const channelId = url.searchParams.get("channelId") || undefined;
  const templateId = url.searchParams.get("templateId") || undefined;

  try {
    const res = await dispatchLineworksPdfToRPA({
      since,
      until,
      channelId,
      templateId,
      // messagesTable: "msg_lw_log",       // 変更したい場合のみ上書き
      // rpaTable: "rpa_command_requests",  // 既定でOK
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`error: ${msg}`, { status: 500 });
  }
}

export const POST = GET;
