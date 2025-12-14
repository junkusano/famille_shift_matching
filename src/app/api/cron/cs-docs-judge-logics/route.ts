// src/app/api/cron/cs-docs-judge-logics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { rebuildJudgeLogicsForDocTypes } from "@/lib/cs_docs_judge_logics";

type Body = {
  mode?: "full" | "incremental";
  windowHours?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const mode: "full" | "incremental" = body.mode ?? "incremental";
    const windowHours = typeof body.windowHours === "number" && body.windowHours > 0 ? body.windowHours : 1;

    const result = await rebuildJudgeLogicsForDocTypes({ mode, windowHours });

    return NextResponse.json({
      ok: true,
      mode,
      windowHours,
      updated: result.updated,
      targetDocTypeCount: result.targetDocTypeIds.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
