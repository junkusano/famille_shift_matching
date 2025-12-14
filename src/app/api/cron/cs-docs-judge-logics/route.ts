// src/app/api/cron/cs-docs-judge-logics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { rebuildJudgeLogicsForDocTypes } from "@/lib/cs_docs_judge_logics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


type Params = {
    mode: "full" | "incremental";
    windowHours: number;
    limitDocTypes: number;
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
    const limitDocTypes =
        Number.isFinite(limNum) && limNum > 0 ? Math.floor(limNum) : 0; // 0=無制限

    return { mode, windowHours, limitDocTypes };
}

async function run(req: NextRequest, body?: unknown) {
    const t0 = Date.now();

    // GETはクエリ、POSTはbody優先（bodyがあればそれを使う）
    const urlParams = parseParamsFromUrl(req);

    let mode = urlParams.mode;
    let windowHours = urlParams.windowHours;
    let limitDocTypes = urlParams.limitDocTypes;

    if (body && typeof body === "object") {
        const b = body as Partial<{ mode: "full" | "incremental"; windowHours: number; limitDocTypes: number }>;
        if (b.mode === "full" || b.mode === "incremental") mode = b.mode;
        if (typeof b.windowHours === "number" && Number.isFinite(b.windowHours) && b.windowHours > 0)
            windowHours = b.windowHours;
        if (typeof b.limitDocTypes === "number" && Number.isFinite(b.limitDocTypes) && b.limitDocTypes > 0)
            limitDocTypes = Math.floor(b.limitDocTypes);
    }

    // ✅ 実行（戻り値をログとして返す）
    const result = await rebuildJudgeLogicsForDocTypes({
        mode,
        windowHours,
        limitDocTypes,
    });

    const ms = Date.now() - t0;

    return NextResponse.json(
        {
            ok: true,
            mode,
            windowHours,
            limitDocTypes,
            updated: result.updated,
            targetDocTypeCount: result.targetDocTypeIds.length,
            sampleDocTypeIds: result.targetDocTypeIds.slice(0, 20),
            ms,
            serverTime: new Date().toISOString(),
            traceId: crypto.randomUUID(),          // ✅毎回変わる＝実行された証拠
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
    console.log("[cs-docs-judge-logics] start", {
        method: req.method,
        url: req.nextUrl.toString(),
        at: new Date().toISOString(),
    });

    try {
        return await run(req);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {

    console.log("[cs-docs-judge-logics] start", {
        method: req.method,
        url: req.nextUrl.toString(),
        at: new Date().toISOString(),
    });

    try {
        const body = await req.json().catch(() => ({}));
        return await run(req, body);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}
