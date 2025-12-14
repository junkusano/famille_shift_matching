// src/app/api/cron/cs-docs-judge-logics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runCsDocsJudgeLogicsCron } from "@/lib/cs_docs_judge_logics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = {
    mode: "full" | "incremental";
    windowHours: number;
    limitDocTypes: number; // 0=無制限
    samplePerDocType: number;
    backfillLimitDocs: number;
};

function parseParamsFromUrl(req: NextRequest): Params {
    const sp = req.nextUrl.searchParams;

    const modeRaw = sp.get("mode");
    const mode: "full" | "incremental" = modeRaw === "full" ? "full" : "incremental";

    const whRaw = sp.get("windowHours");
    const windowHoursNum = whRaw ? Number(whRaw) : 1;
    const windowHours = Number.isFinite(windowHoursNum) && windowHoursNum > 0 ? windowHoursNum : 1;

    const limRaw = sp.get("limitDocTypes");
    const limNum = limRaw ? Number(limRaw) : 0;
    const limitDocTypes = Number.isFinite(limNum) && limNum > 0 ? Math.floor(limNum) : 0;

    const spdRaw = sp.get("samplePerDocType");
    const spdNum = spdRaw ? Number(spdRaw) : 30;
    const samplePerDocType = Number.isFinite(spdNum) && spdNum > 0 ? Math.floor(spdNum) : 30;

    const bldRaw = sp.get("backfillLimitDocs");
    const bldNum = bldRaw ? Number(bldRaw) : 5000;
    const backfillLimitDocs = Number.isFinite(bldNum) && bldNum > 0 ? Math.floor(bldNum) : 5000;

    return { mode, windowHours, limitDocTypes, samplePerDocType, backfillLimitDocs };
}

function logStart(req: NextRequest) {
    console.log("[cs-docs-judge-logics] start", {
        method: req.method,
        url: req.nextUrl.toString(),
        at: new Date().toISOString(),
    });
}

async function run(req: NextRequest, body?: unknown) {
    const t0 = Date.now();

    // GETはクエリ、POSTはbody優先（bodyがあればそれを使う）
    const urlParams = parseParamsFromUrl(req);

    let mode = urlParams.mode;
    let windowHours = urlParams.windowHours;
    let limitDocTypes = urlParams.limitDocTypes;
    let samplePerDocType = urlParams.samplePerDocType;
    let backfillLimitDocs = urlParams.backfillLimitDocs;

    if (body && typeof body === "object") {
        const b = body as Partial<{
            mode: "full" | "incremental";
            windowHours: number;
            limitDocTypes: number;
            samplePerDocType: number;
            backfillLimitDocs: number;
        }>;

        if (b.mode === "full" || b.mode === "incremental") mode = b.mode;

        if (typeof b.windowHours === "number" && Number.isFinite(b.windowHours) && b.windowHours > 0) {
            windowHours = b.windowHours;
        }

        if (typeof b.limitDocTypes === "number" && Number.isFinite(b.limitDocTypes) && b.limitDocTypes > 0) {
            limitDocTypes = Math.floor(b.limitDocTypes);
        }

        if (typeof b.samplePerDocType === "number" && Number.isFinite(b.samplePerDocType) && b.samplePerDocType > 0) {
            samplePerDocType = Math.floor(b.samplePerDocType);
        }

        if (typeof b.backfillLimitDocs === "number" && Number.isFinite(b.backfillLimitDocs) && b.backfillLimitDocs > 0) {
            backfillLimitDocs = Math.floor(b.backfillLimitDocs);
        }
    }

    // ✅ 実行（backfill → judge_logics(v2)）
    const result = await runCsDocsJudgeLogicsCron({
        mode,
        windowHours,
        backfillLimitDocs,
        limitDocTypes,
        samplePerDocType,
    });

    const ms = Date.now() - t0;

    // ✅ doneログ（startしか出ない問題を潰す）
    console.log("[cs-docs-judge-logics] done", {
        mode,
        windowHours,
        limitDocTypes,
        samplePerDocType,
        backfillLimitDocs,
        backfill: result.backfill,
        rebuildV2: {
            updated: result.rebuildV2.updated,
            targetDocTypeCount: result.rebuildV2.targetDocTypeIds.length,
            skippedCount: result.rebuildV2.skipped.length,
            skippedTop: result.rebuildV2.skipped.slice(0, 10),
        },
        ms,
    });

    return NextResponse.json(
        {
            ok: true,
            mode,
            windowHours,
            limitDocTypes,
            samplePerDocType,
            backfillLimitDocs,

            backfill: result.backfill,
            rebuildV2: {
                updated: result.rebuildV2.updated,
                targetDocTypeCount: result.rebuildV2.targetDocTypeIds.length,
                sampleDocTypeIds: result.rebuildV2.targetDocTypeIds.slice(0, 20),
                skipped: result.rebuildV2.skipped.slice(0, 200),
            },

            ms,
            serverTime: new Date().toISOString(),
            traceId: crypto.randomUUID(), // ✅毎回変わる＝実行された証拠
        },
        {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
                Pragma: "no-cache",
                Expires: "0",
            },
        }
    );
}

export async function GET(req: NextRequest) {
    logStart(req);
    try {
        return await run(req);
    } catch (e) {
        console.error("[cs-docs-judge-logics] error", e);
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    logStart(req);
    try {
        const body = await req.json().catch(() => ({}));
        return await run(req, body);
    } catch (e) {
        console.error("[cs-docs-judge-logics] error", e);
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
