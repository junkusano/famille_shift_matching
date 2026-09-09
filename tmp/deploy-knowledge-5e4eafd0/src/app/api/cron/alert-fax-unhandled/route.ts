import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { runFaxUnhandledLineworksCheck } from "@/lib/alert_add/fax_unhandled_lineworks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
    const result = await runFaxUnhandledLineworksCheck();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron][alert-fax-unhandled] error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
