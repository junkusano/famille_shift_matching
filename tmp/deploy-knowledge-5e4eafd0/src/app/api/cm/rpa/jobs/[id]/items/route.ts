// =============================================================
// src/app/api/cm/rpa/jobs/[id]/items/route.ts
// RPA ジョブアイテム一括登録 API
// =============================================================

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { cmRpaApiHandlerWithContext } from "@/lib/cm/rpa/cmRpaApiHandler";
import type {
  CmCreateJobItemsRequest,
  CmCreateJobItemsResponse,
} from "@/types/cm/jobs";

// =============================================================
// 定数
// =============================================================

/** 一度に登録可能な最大件数 */
const MAX_ITEMS_PER_REQUEST = 1000;

// =============================================================
// 型定義
// =============================================================

type RouteContext = {
  params: Promise<{ id: string }>;
};

// =============================================================
// バリデーション
// =============================================================

type CreateItemsValidationResult =
  | { valid: true; data: CmCreateJobItemsRequest }
  | { valid: false; error: string };

function cmValidateCreateItemsRequest(
  body: unknown
): CreateItemsValidationResult {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "リクエストボディが不正です" };
  }

  const req = body as Record<string, unknown>;

  // items（必須）
  if (!req.items || !Array.isArray(req.items)) {
    return { valid: false, error: "items 配列は必須です" };
  }

  // 件数チェック
  if (req.items.length === 0) {
    return { valid: false, error: "items は1件以上必要です" };
  }

  if (req.items.length > MAX_ITEMS_PER_REQUEST) {
    return {
      valid: false,
      error: `items は ${MAX_ITEMS_PER_REQUEST} 件以下にしてください`,
    };
  }

  // 各アイテムのバリデーション
  const validatedItems: CmCreateJobItemsRequest["items"] = [];

  for (let i = 0; i < req.items.length; i++) {
    const item = req.items[i] as Record<string, unknown>;

    if (!item || typeof item !== "object") {
      return { valid: false, error: `items[${i}] が不正です` };
    }

    // target_id（必須）
    if (typeof item.target_id !== "string" || item.target_id.trim() === "") {
      return {
        valid: false,
        error: `items[${i}].target_id は必須です（空文字不可）`,
      };
    }

    // target_name（オプション）
    if (
      item.target_name !== undefined &&
      item.target_name !== null &&
      typeof item.target_name !== "string"
    ) {
      return {
        valid: false,
        error: `items[${i}].target_name は文字列または null です`,
      };
    }

    validatedItems.push({
      target_id: item.target_id.trim(),
      target_name: item.target_name as string | undefined,
    });
  }

  return {
    valid: true,
    data: { items: validatedItems },
  };
}

// =============================================================
// POST /api/cm/rpa/jobs/:id/items - アイテム一括登録
// =============================================================

export const POST = cmRpaApiHandlerWithContext<
  CmCreateJobItemsResponse,
  RouteContext
>(
  "cm/api/rpa/jobs/[id]/items",
  async (request, context, logger) => {
    // パラメータ取得
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

    // バリデーション
    const validation = cmValidateCreateItemsRequest(body);
    if (!validation.valid) {
      const errorResult = validation as { valid: false; error: string };
      return NextResponse.json(
        { ok: false, error: errorResult.error },
        { status: 400 }
      );
    }

    const { items } = validation.data;

    logger.info("アイテム一括登録開始", { jobId, itemCount: items.length });

    // ジョブ存在チェック
    const { data: job, error: jobError } = await supabaseAdmin
      .from("cm_jobs")
      .select("id, status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "ジョブが見つかりません" },
        { status: 404 }
      );
    }

    // ジョブのステータスチェック
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `ステータスが ${job.status} のジョブにはアイテムを追加できません`,
        },
        { status: 400 }
      );
    }

    // アイテムデータ作成
    const records = items.map((item) => ({
      job_id: jobId,
      target_id: item.target_id,
      target_name: item.target_name ?? null,
      status: "pending" as const,
    }));

    // upsert で重複を許容（job_id + target_id が重複した場合は無視）
    const { error: upsertError } = await supabaseAdmin
      .from("cm_job_items")
      .upsert(records, {
        onConflict: "job_id,target_id",
        ignoreDuplicates: true,
      });

    if (upsertError) {
      logger.error("アイテム登録エラー", undefined, {
        message: upsertError.message,
        code: upsertError.code,
      });
      return NextResponse.json(
        { ok: false, error: "アイテムの登録に失敗しました" },
        { status: 500 }
      );
    }

    logger.info("アイテム一括登録完了", { jobId, count: items.length });

    return NextResponse.json({
      ok: true,
      count: items.length,
    });
  }
);