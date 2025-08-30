import { NextRequest, NextResponse } from "next/server";
import { dispatchPdfFromChannel } from "@/lib/supabase/dispatchPdfFromChannel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ok(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true; // 未設定なら通す
  const bearer = req.headers.get("authorization") || "";
  if (bearer === `Bearer ${secret}`) return true;
  const q = new URL(req.url).searchParams.get("secret");
  return q === secret;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return new NextResponse("unauthorized", { status: 401 });

  try {
    // Supabase呼び出しは lib 側で完結
    const res = await dispatchPdfFromChannel();
    return NextResponse.json({ ok: true, ...res });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`error: ${msg}`, { status: 500 });
  }
}

export const POST = GET;
