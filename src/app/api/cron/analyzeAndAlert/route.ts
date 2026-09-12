import { NextRequest, NextResponse } from "next/server";
import { runUnhandledRequestAlerts } from "@/lib/agent-playbooks/unhandledRequestAlert";
import { assertCronAuth } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    assertCronAuth(request);
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const requestedTime = dryRun ? request.nextUrl.searchParams.get("at") : null;
    const parsedTime = requestedTime ? new Date(requestedTime) : null;
    const result = await runUnhandledRequestAlerts({
      dryRun,
      now: parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime : undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron][analyzeAndAlert] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
