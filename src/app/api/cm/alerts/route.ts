// src/app/api/cm/alerts/route.ts
// アラート一覧取得API
//
// GET /api/cm/alerts
//   - status: フィルタ（unread, read, applying, resolved）複数指定可（カンマ区切り）
//   - category: フィルタ（insurance, no_manager）
//   - limit: 取得件数（デフォルト: 50）
//
// レスポンス:
//   - alerts: アラート一覧
//   - summary: カテゴリ別・重要度別の件数

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("cm/api/alerts");

// Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** アラートレスポンス型 */
type CmAlertResponse = {
  id: string;
  kaipoke_cs_id: string;
  client_name: string;
  category: "insurance" | "no_manager";
  alert_type: string;
  severity: "critical" | "warning" | "info";
  status: "unread" | "read" | "applying" | "resolved";
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** サマリーレスポンス型 */
type CmAlertSummary = {
  total: number;
  critical: number;
  warning: number;
  byCategory: {
    insurance: { critical: number; warning: number };
    no_manager: { critical: number; warning: number };
  };
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // クエリパラメータ
    const statusParam = searchParams.get("status"); // カンマ区切りで複数指定可
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // ステータスフィルタ（デフォルト: resolved以外）
    const statuses = statusParam
      ? statusParam.split(",").map((s) => s.trim())
      : ["unread", "read", "applying"];

    // クエリ構築
    let query = supabaseAdmin
      .from("cm_alerts")
      .select("*")
      .in("status", statuses)
      .order("severity", { ascending: true }) // critical が先
      .order("created_at", { ascending: false })
      .limit(limit);

    // カテゴリフィルタ
    if (category) {
      query = query.eq("category", category);
    }

    const { data: alerts, error } = await query;

    if (error) {
      logger.error("アラート取得失敗", error);
      return NextResponse.json(
        { error: "アラート取得に失敗しました" },
        { status: 500 }
      );
    }

    // サマリー計算（resolved以外の全件）
    const { data: allAlerts, error: summaryError } = await supabaseAdmin
      .from("cm_alerts")
      .select("category, severity")
      .in("status", ["unread", "read", "applying"]);

    if (summaryError) {
      logger.error("サマリー取得失敗", summaryError);
    }

    const summary: CmAlertSummary = {
      total: 0,
      critical: 0,
      warning: 0,
      byCategory: {
        insurance: { critical: 0, warning: 0 },
        no_manager: { critical: 0, warning: 0 },
      },
    };

    for (const alert of allAlerts ?? []) {
      summary.total++;
      if (alert.severity === "critical") {
        summary.critical++;
      } else if (alert.severity === "warning") {
        summary.warning++;
      }

      const cat = alert.category as "insurance" | "no_manager";
      if (summary.byCategory[cat]) {
        if (alert.severity === "critical") {
          summary.byCategory[cat].critical++;
        } else if (alert.severity === "warning") {
          summary.byCategory[cat].warning++;
        }
      }
    }

    logger.info("アラート取得成功", {
      count: alerts?.length ?? 0,
      summary,
    });

    return NextResponse.json({
      alerts: alerts as CmAlertResponse[],
      summary,
    });
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return NextResponse.json(
      { error: "サーバーエラーが発生しました" },
      { status: 500 }
    );
  }
}