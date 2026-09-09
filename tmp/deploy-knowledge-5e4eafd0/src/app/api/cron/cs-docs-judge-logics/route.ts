import { NextRequest, NextResponse } from "next/server";
import { runCsDocsJudgeLogicsCron } from "@/lib/cs_docs_judge_logics";

/**
 * GET /api/cron/cs-docs-judge-logics
 *
 * Query:
 * - mode: "incremental" | "full" (default: incremental)
 * - windowHours: number (default: 1)
 * - limitDocTypes: number (default: 0 = all)
 * - samplePerDocType: number (default: 30)
 * - backfillLimitDocs: number (default: 5000)
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const mode = (url.searchParams.get("mode") || "incremental") as
      | "incremental"
      | "full";

    const windowHours = Number(url.searchParams.get("windowHours") || "1");
    const limitDocTypes = Number(url.searchParams.get("limitDocTypes") || "0");
    const samplePerDocType = Number(url.searchParams.get("samplePerDocType") || "30");
    const backfillLimitDocs = Number(url.searchParams.get("backfillLimitDocs") || "5000");

    const result = await runCsDocsJudgeLogicsCron({
      mode,
      windowHours: Number.isFinite(windowHours) ? windowHours : 1,
      limitDocTypes: Number.isFinite(limitDocTypes) ? limitDocTypes : 0,
      samplePerDocType: Number.isFinite(samplePerDocType) ? samplePerDocType : 30,
      backfillLimitDocs: Number.isFinite(backfillLimitDocs) ? backfillLimitDocs : 5000,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cs-docs-judge-logics][route] error", e);
    return NextResponse.json(
      { ok: false, error: String(e) },
      { status: 500 }
    );
  }
}
