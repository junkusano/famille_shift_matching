import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runFaxOcrOnReceive } from "@/lib/cm/faxOcrOnReceive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const result = await runFaxOcrOnReceive();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron][fax-ocr-on-receive] error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
