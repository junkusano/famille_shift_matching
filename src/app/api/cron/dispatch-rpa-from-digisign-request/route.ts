//api/cron/dispatch-rpa-from-disisign-request
import { NextRequest, NextResponse } from "next/server";
import { dispatchLineworksPdfToRPA, dispatchCareManagerDigisign } from "@/lib/supabase/analyzeDigisignRequest";

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
  const caremgr = url.searchParams.get("caremgr") === "1";
  const pageSize = Number(url.searchParams.get("pageSize") ?? 5000);
  try {
    const res = caremgr && !channelId && !templateId
      ? await dispatchCareManagerDigisign({ since, until, pageSize })
      : await dispatchLineworksPdfToRPA({ since, until, channelId, templateId });
    return NextResponse.json({ ok: true, ...res });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`error: ${msg}`, { status: 500 });
  }
}
export const POST = GET;
