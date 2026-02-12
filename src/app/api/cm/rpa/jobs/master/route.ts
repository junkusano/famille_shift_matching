// =============================================================
// src/app/api/cm/rpa/jobs/master/route.ts
// RPA ジョブマスタ取得 API（管理画面用）
// =============================================================

import { NextResponse } from "next/server";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";
import { getJobMaster } from "@/lib/cm/rpa-jobs/actions";
import type { CmJobMasterResponse } from "@/types/cm/jobs";

// =============================================================
// GET /api/cm/rpa/jobs/master - マスタ取得
// =============================================================

export const GET = cmRpaApiHandler<CmJobMasterResponse>(
  "cm/api/rpa/jobs/master",
  async (request, logger) => {
    const { searchParams } = new URL(request.url);
    const queueCode = searchParams.get("queue") ?? undefined;

    logger.info("マスタ取得", { queueCode });

    const result = await getJobMaster(queueCode);

    if (result.ok === false) {
      return NextResponse.json(result, { status: 500 });
    }

    logger.info("マスタ取得完了", {
      queueCount: result.queues.length,
      jobTypeCount: result.jobTypes.length,
    });

    return NextResponse.json(result);
  }
);