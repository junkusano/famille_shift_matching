import { NextRequest, NextResponse } from "next/server";
import { runManagerRiskAlerts } from "@/lib/agent-playbooks/managerRiskAlert";
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
    const now = parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime : undefined;
    const [unhandledResult, managerRiskResult] = await Promise.allSettled([
      runUnhandledRequestAlerts({ dryRun, now }),
      runManagerRiskAlerts({ dryRun, now }),
    ]);
    const unhandled = unhandledResult.status === "fulfilled"
      ? unhandledResult.value
      : { ok: false, error: unhandledResult.reason instanceof Error ? unhandledResult.reason.message : String(unhandledResult.reason) };
    const managerRisk = managerRiskResult.status === "fulfilled"
      ? managerRiskResult.value
      : { ok: false, error: managerRiskResult.reason instanceof Error ? managerRiskResult.reason.message : String(managerRiskResult.reason) };
    const ok = unhandled.ok && managerRisk.ok;
    return NextResponse.json({ ok, unhandled, managerRisk }, { status: ok ? 200 : 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron][analyzeAndAlert] failed", { message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
