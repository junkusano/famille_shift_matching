// src/app/api/cron/user_ojt/route.ts

import { NextRequest, NextResponse } from "next/server";
import { runUserOjtJob } from "@/lib/user_ojt";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  // ---- 認証 ----
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req);

  if (!serverSecret) {
    console.warn("[user_ojt][auth] CRON_SECRET が未設定です");
    return NextResponse.json(
      { ok: false, reason: "server_secret_not_configured" },
      { status: 500 }
    );
  }

  if (incoming.token !== serverSecret) {
    console.warn("[user_ojt][auth] invalid token", incoming);
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 }
    );
  }

  // ---- dryRun 判定 ----
  const url = new URL(req.url);
  const dryRunParam =
    url.searchParams.get("dryRun") ?? url.searchParams.get("dry_run");
  const dryRun =
    dryRunParam === "1" ||
    dryRunParam === "true" ||
    dryRunParam === "yes";

  // ---- 本体処理 ----
  const result = await runUserOjtJob({ dryRun });
  const status = result.ok ? 200 : 500;

  return NextResponse.json(result, { status });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
