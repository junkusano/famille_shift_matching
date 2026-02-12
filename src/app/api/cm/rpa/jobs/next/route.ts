// =============================================================
// src/app/api/cm/rpa/jobs/next/route.ts
// RPA 次のジョブ取得 API（ワーカー用）
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cmRpaApiHandler } from "@/lib/cm/rpa/cmRpaApiHandler";
import { cmIsValidQueue } from "@/lib/cm/rpa/cmRpaJobValidation";
import type { CmNextJobResponse } from "@/types/cm/jobs";

// =============================================================
// GET /api/cm/rpa/jobs/next - 次のジョブ取得
// =============================================================

export const GET = cmRpaApiHandler<CmNextJobResponse>(
  "cm/api/rpa/jobs/next",
  async (request, logger) => {
    const { searchParams } = new URL(request.url);
    const queue = searchParams.get("queue");

    if (!queue) {
      return NextResponse.json(
        { ok: false, error: "queue パラメータは必須です" },
        { status: 400 }
      );
    }

    if (!(await cmIsValidQueue(queue))) {
      return NextResponse.json(
        { ok: false, error: `無効なキュー: ${queue}` },
        { status: 400 }
      );
    }

    logger.info("次のジョブ取得", { queue });

    // DB関数を使用してアトミックに取得・更新
    // get_next_job は pending のジョブを processing に更新して返す
    const { data, error } = await supabaseAdmin.rpc("get_next_job", {
      p_queue: queue,
    });

    if (error) {
      logger.error("次のジョブ取得エラー", undefined, {
        message: error.message,
        code: error.code,
      });
      return NextResponse.json(
        { ok: false, error: "次のジョブの取得に失敗しました" },
        { status: 500 }
      );
    }

    // 結果が空配列または null の場合は null を返す
    const job = Array.isArray(data) ? data[0] || null : data || null;

    if (job) {
      logger.info("ジョブ取得成功", { jobId: job.id, jobType: job.job_type });
    } else {
      logger.info("待機中のジョブなし", { queue });
    }

    return NextResponse.json({ ok: true, job });
  }
);