// src/app/api/cron/fax_re_ocr/route.ts

import { NextRequest, NextResponse } from "next/server";
import { runFaxReOcr } from "@/lib/fax_re_ocr";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  // ---- 認証 ----
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req); // { token: string; src: "query" | "header" | "auth" | "none" }

  const incomingToken = incoming?.token ?? "";

  console.info("[fax_re_ocr][auth]", {
    path: "/api/cron/fax_re_ocr",
    src: incoming?.src ?? "none",
    hasServerSecret: !!serverSecret,
    tokenPreview: incomingToken
      ? `${incomingToken.slice(0, 2)}...(${incomingToken.length})`
      : null,
  });

  if (!serverSecret) {
    console.warn("[fax_re_ocr][auth] CRON_SECRET が未設定です");
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET is not set on server",
      },
      { status: 500 },
    );
  }

  if (!incomingToken || incomingToken !== serverSecret) {
    console.warn("[fax_re_ocr][auth] invalid token", {
      src: incoming?.src ?? "none",
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
      },
      { status: 401 },
    );
  }

  // ---- クエリパラメータ ----
  const { searchParams } = new URL(req.url);

  const daysBackParam = searchParams.get("days_back");
  const limitParam = searchParams.get("limit");
  const dryRunParam = searchParams.get("dry_run");
  const verboseParam = searchParams.get("verbose");

  let daysBack: number | undefined;
  if (daysBackParam !== null) {
    const v = Number(daysBackParam);
    if (!Number.isNaN(v)) daysBack = v;
  }

  let limit: number | undefined;
  if (limitParam !== null) {
    const v = Number(limitParam);
    if (!Number.isNaN(v)) limit = v;
  }

  const dryRun = dryRunParam === "true";
  const verbose = verboseParam === "true";

  console.info("[fax_re_ocr][start]", {
    daysBack,
    limit,
    dryRun,
    verbose,
  });

  // ---- 本体処理 ----
  const result = await runFaxReOcr({
    daysBack,
    limit,
    dryRun,
    verbose,
  });

  const status = result.ok ? 200 : 500;
  console.info("[fax_re_ocr][done]", {
    status,
    scannedDocs: result.scannedDocs,
    toAnalyzeCount: result.toAnalyzeCount,
    analyzedCount: result.analyzedCount,
    updatedMetaCount: result.updatedMetaCount,
    skippedLimit: result.skippedLimit,
    errorCount: result.errors.length,
  });

  return NextResponse.json(result, { status });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
