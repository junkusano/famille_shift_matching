// =============================================================
// src/app/api/audit/logs/route.ts
// ログ取得API（管理画面用）
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("api/audit/logs");

// =============================================================
// GET: ログ検索
// =============================================================

export async function GET(req: NextRequest) {
  try {
    // ---------------------------------------------------------
    // クエリパラメータ取得
    // ---------------------------------------------------------
    const { searchParams } = new URL(req.url);

    const env = searchParams.get("env");
    const level = searchParams.get("level");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    //const module = searchParams.get("module");
    const message = searchParams.get("message");
    const traceId = searchParams.get("traceId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    logger.info("ログ検索開始", { env, level, from, to, module, message, traceId, page });

    // ---------------------------------------------------------
    // クエリ構築（audit スキーマを直接参照）
    // ---------------------------------------------------------
    let query = supabaseAdmin
      .schema("audit")
      .from("system_logs")
      .select("*", { count: "exact" });

    if (env && ["production", "preview", "development"].includes(env)) {
      query = query.eq("env", env);
    }

    if (level && ["warn", "error"].includes(level)) {
      query = query.eq("level", level);
    }

    if (from) {
      query = query.gte("timestamp", from);
    }

    if (to) {
      query = query.lte("timestamp", to);
    }

    if (module) {
      query = query.ilike("module", `%${module}%`);
    }

    if (message) {
      query = query.ilike("message", `%${message}%`);
    }

    if (traceId) {
      query = query.eq("trace_id", traceId);
    }

    query = query
      .order("timestamp", { ascending: false })
      .range(offset, offset + limit - 1);

    // ---------------------------------------------------------
    // 実行
    // ---------------------------------------------------------
    const { data, error, count } = await query;

    if (error) {
      logger.error("クエリエラー", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { ok: false, error: error.message || "クエリエラー" },
        { status: 500 }
      );
    }

    logger.info("ログ検索完了", { count, page });

    // ---------------------------------------------------------
    // レスポンス
    // ---------------------------------------------------------
    return NextResponse.json({
      ok: true,
      logs: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
        hasNext: offset + limit < (count || 0),
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    logger.error("例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}