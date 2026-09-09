// =============================================================
// src/app/api/cm/rpa/jobs/route.ts
// RPA ジョブ API（作成・一覧取得）
// =============================================================

import { NextResponse } from "next/server";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";
import { cmGetJobsCore, cmCreateJobCore } from "@/lib/cm/rpa-jobs/core";
import type { CmJobListResponse, CmCreateJobResponse } from "@/types/cm/jobs";

// =============================================================
// GET /api/cm/rpa/jobs - ジョブ一覧取得
// =============================================================

export const GET = cmRpaApiHandler<CmJobListResponse>(
  "cm/api/rpa/jobs",
  async (request, logger) => {
    const { searchParams } = new URL(request.url);

    const result = await cmGetJobsCore({
      queue: searchParams.get("queue") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      limit: parseInt(searchParams.get("limit") || "50", 10),
      offset: parseInt(searchParams.get("offset") || "0", 10),
    });

    if (result.ok === false) {
      return NextResponse.json(result, { status: 500 });
    }

    logger.info("ジョブ一覧取得完了", {
      count: result.jobs.length,
      total: result.total,
    });

    return NextResponse.json(result);
  }
);

// =============================================================
// POST /api/cm/rpa/jobs - ジョブ作成
// =============================================================

export const POST = cmRpaApiHandler<CmCreateJobResponse>(
  "cm/api/rpa/jobs",
  async (request, logger) => {
    // リクエストボディ取得
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "リクエストボディのパースに失敗しました" },
        { status: 400 }
      );
    }

    const { queue, job_type } = (body as Record<string, unknown>) ?? {};
    logger.info("ジョブ作成開始", { queue, job_type });

    // バリデーション・マスタ検証・重複チェック・INSERT は全て cmCreateJobCore 内で実施
    const result = await cmCreateJobCore({
      queue: queue as string,
      job_type: job_type as string,
      payload: (body as Record<string, unknown>)?.payload as
        | Record<string, unknown>
        | undefined,
    });

    if (result.ok === false) {
      // existing_job_id がある場合は 409 Conflict
      const status = "existing_job_id" in result ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    logger.info("ジョブ作成完了", { jobId: result.job.id });

    return NextResponse.json(result, { status: 201 });
  }
);