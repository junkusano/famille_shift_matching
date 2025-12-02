// =============================================================
// src/app/api/cron/plaud-support-progress-summary/route.ts
// Plaud支援経過要約生成 + RPAリクエスト作成 API
// =============================================================
//
// 【概要】
// Cronジョブから定期実行されるAPIエンドポイント。
// cm_plaud_sumテーブルの未処理データとリトライ対象を一括処理し、
// OpenAIで要約を生成してRPAリクエストを作成する。
//
// 【呼び出し方法】
// GET /api/cron/plaud-support-progress-summary
// POST /api/cron/plaud-support-progress-summary
// 
// 【認証】
// Authorization: Bearer {CRON_SECRET}
//
// 【クエリパラメータ】
// - dryRun / dry_run: "true" | "1" | "yes" → テスト実行（DBに保存しない）
// - from: ISO 8601形式の日付 → この日付以降のデータのみ処理
// - limit: 数値 → 処理件数上限
//
// =============================================================

import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { runPlaudSupportProgressSummary } from "@/lib/plaud_support_progress_summary/plaud_support_progress_summary";
import { getServerCronSecret, getIncomingCronToken } from "@/lib/cron/auth";

function parseIntOrNull(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseBooleanParam(v: string | null): boolean {
  return v === "1" || v === "true" || v === "yes";
}

async function handler(req: NextRequest) {
  // 認証チェック
  const serverSecret = getServerCronSecret();
  const incoming = getIncomingCronToken(req);

  if (!serverSecret) {
    console.warn("[plaud-support-progress-summary][auth] CRON_SECRET が未設定です");
    return NextResponse.json(
      { ok: false, reason: "server_secret_not_configured" },
      { status: 500 }
    );
  }

  if (incoming.token !== serverSecret) {
    console.warn("[plaud-support-progress-summary][auth] invalid token", incoming);
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 }
    );
  }

  // クエリパラメータ取得
  const url = new URL(req.url);
  const dryRunParam =
    url.searchParams.get("dryRun") ?? url.searchParams.get("dry_run");
  const dryRun = parseBooleanParam(dryRunParam);
  const fromDate = url.searchParams.get("from") || undefined;
  const limitParam = parseIntOrNull(url.searchParams.get("limit"));

  // 本体処理実行
  try {
    const result = await runPlaudSupportProgressSummary({
      dryRun,
      fromDate,
      limit: limitParam ?? undefined,
    });

    const status = result.ok ? 200 : 500;
    return NextResponse.json(result, { status });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[plaud-support-progress-summary] error", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
