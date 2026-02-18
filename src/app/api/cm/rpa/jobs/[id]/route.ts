// =============================================================
// src/app/api/cm/rpa/jobs/[id]/route.ts
// RPA ジョブ詳細 API（取得・更新）
// =============================================================

import { NextResponse } from "next/server";
import { cmRpaApiHandlerWithContext } from "@/lib/cm/rpa/cmRpaApiHandler";
import { cmGetJobDetailCore, cmUpdateJobCore } from "@/lib/cm/rpa-jobs/core";
import type { UpdateJobParams } from "@/lib/cm/rpa-jobs/core";
import type {
  CmJobDetailResponse,
  CmUpdateJobResponse,
  CmJobStatus,
} from "@/types/cm/jobs";

// =============================================================
// 型定義
// =============================================================

type RouteContext = {
  params: Promise<{ id: string }>;
};

// =============================================================
// バリデーション
// =============================================================

const VALID_STATUSES: readonly CmJobStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
];

type UpdateJobValidationResult =
  | { valid: true; data: UpdateJobParams }
  | { valid: false; error: string };

/**
 * ジョブ更新リクエストのバリデーション
 * API Route 固有の入力検証（HTTPリクエストの body → UpdateJobParams への変換）
 */
function cmValidateUpdateJobRequest(body: unknown): UpdateJobValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "リクエストボディが不正です" };
  }

  const req = body as Record<string, unknown>;
  const updates: UpdateJobParams = {};

  // status（オプション）
  if (req.status !== undefined) {
    if (typeof req.status !== "string") {
      return { valid: false, error: "status は文字列です" };
    }
    if (!VALID_STATUSES.includes(req.status as CmJobStatus)) {
      return {
        valid: false,
        error: `status は ${VALID_STATUSES.join(", ")} のいずれかです`,
      };
    }
    updates.status = req.status as CmJobStatus;
  }

  // progress_message（オプション）
  if (req.progress_message !== undefined) {
    if (
      req.progress_message !== null &&
      typeof req.progress_message !== "string"
    ) {
      return { valid: false, error: "progress_message は文字列または null です" };
    }
    updates.progress_message = req.progress_message as string;
  }

  // error_message（オプション）
  if (req.error_message !== undefined) {
    if (
      req.error_message !== null &&
      typeof req.error_message !== "string"
    ) {
      return { valid: false, error: "error_message は文字列または null です" };
    }
    updates.error_message = req.error_message as string;
  }

  // 更新項目が1つもない場合
  if (Object.keys(updates).length === 0) {
    return { valid: false, error: "更新する項目がありません" };
  }

  return { valid: true, data: updates };
}

// =============================================================
// GET /api/cm/rpa/jobs/:id - ジョブ詳細取得
// =============================================================

export const GET = cmRpaApiHandlerWithContext<CmJobDetailResponse, RouteContext>(
  "cm/api/rpa/jobs/[id]",
  async (request, context, logger) => {
    void request;

    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: "無効なジョブIDです" },
        { status: 400 }
      );
    }

    logger.info("ジョブ詳細取得", { jobId });

    const result = await cmGetJobDetailCore(jobId);

    if (result.ok === false) {
      const status = result.error === "ジョブが見つかりません" ? 404 : 500;
      return NextResponse.json(result, { status });
    }

    logger.info("ジョブ詳細取得完了", { jobId, itemCount: result.items.length });

    return NextResponse.json(result);
  }
);

// =============================================================
// PUT /api/cm/rpa/jobs/:id - ジョブ更新
// =============================================================

export const PUT = cmRpaApiHandlerWithContext<CmUpdateJobResponse, RouteContext>(
  "cm/api/rpa/jobs/[id]",
  async (request, context, logger) => {
    const { id } = await context.params;
    const jobId = parseInt(id, 10);

    if (isNaN(jobId)) {
      return NextResponse.json(
        { ok: false, error: "無効なジョブIDです" },
        { status: 400 }
      );
    }

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

    // バリデーション（HTTP 入力 → UpdateJobParams への変換）
    const validation = cmValidateUpdateJobRequest(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      return NextResponse.json(
        { ok: false, error: errorResult.error },
        { status: 400 }
      );
    }

    logger.info("ジョブ更新開始", { jobId, updates: validation.data });

    // DB更新は cmUpdateJobCore に委譲
    const result = await cmUpdateJobCore(jobId, validation.data);

    if (result.ok === false) {
      const status = result.error === "ジョブが見つかりません" ? 404 : 500;
      return NextResponse.json(result, { status });
    }

    logger.info("ジョブ更新完了", { jobId, status: result.job.status });

    return NextResponse.json(result);
  }
);