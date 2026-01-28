// =============================================================
// src/lib/cm/alerts/getAlerts.ts
// アラート一覧取得（Server Action）
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";

const logger = createLogger("lib/cm/alerts/getAlerts");

// =============================================================
// Types
// =============================================================

export type CmAlertResponse = {
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

export type CmAlertSummary = {
  total: number;
  critical: number;
  warning: number;
  byCategory: {
    insurance: { critical: number; warning: number };
    no_manager: { critical: number; warning: number };
  };
};

export type GetAlertsParams = {
  status?: string[];
  category?: string;
  limit?: number;
};

export type GetAlertsResult = {
  ok: true;
  alerts: CmAlertResponse[];
  summary: CmAlertSummary;
} | {
  ok: false;
  error: string;
};

// =============================================================
// アラート一覧取得
// =============================================================

export async function getAlerts(
  params: GetAlertsParams = {}
): Promise<GetAlertsResult> {
  const {
    status = ["unread", "read", "applying"],
    category,
    limit = 50,
  } = params;

  try {
    // クエリ構築
    let query = supabaseAdmin
      .from("cm_alerts")
      .select("*")
      .in("status", status)
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
      return { ok: false, error: "アラート取得に失敗しました" };
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

    return {
      ok: true,
      alerts: (alerts ?? []) as CmAlertResponse[],
      summary,
    };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
