import "server-only";

import { createHash } from "crypto";
import { google } from "googleapis";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/service";
import type {
  ConnectorResult,
  KnowledgeConnector,
  NormalizedSourceObject,
  ProposedKnowledge,
} from "@/lib/knowledge/types";

const configSchema = z.object({
  propertyId: z.string().trim().regex(/^\d+$/, "GA4の数値プロパティIDを設定してください。"),
  lookbackDays: z.number().int().min(7).max(90).default(28),
  siteUrl: z.string().url().default("https://www.shi-on.net/"),
  credentialSecretName: z.string().trim().min(1).default("google_service_account_key"),
});

type ReportRow = {
  dimensions: string[];
  metrics: number[];
};

const NORMALIZATION_VERSION = 1;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jstDate(offsetDays: number) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1_000);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function numberValue(value: string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function reportRows(data: {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string | null }> | null;
    metricValues?: Array<{ value?: string | null }> | null;
  }> | null;
}): ReportRow[] {
  return (data.rows ?? []).map((row) => ({
    dimensions: (row.dimensionValues ?? []).map((value) => value.value ?? ""),
    metrics: (row.metricValues ?? []).map((value) => numberValue(value.value)),
  }));
}

export async function createAnalyticsClient(secretName: string) {
  const { data, error } = await supabaseAdmin.rpc("read_secret", { secret_name: secretName });
  if (error || typeof data !== "string") {
    throw new Error("Google認証情報を取得できませんでした。");
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(data) as Record<string, unknown>;
  } catch {
    throw new Error("Google認証情報の形式が正しくありません。");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
  return google.analyticsdata({ version: "v1beta", auth });
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(value);
}

export const googleAnalyticsConnector: KnowledgeConnector = {
  key: "google_analytics",

  async testConnection(ctx) {
    const config = configSchema.parse(ctx.source.config);
    const analytics = await createAnalyticsClient(config.credentialSecretName);
    const response = await analytics.properties.runReport({
      property: `properties/${config.propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
        metrics: [{ name: "sessions" }],
        limit: "1",
      },
    });
    return {
      ok: true,
      details: {
        propertyId: config.propertyId,
        sessions: numberValue(response.data.rows?.[0]?.metricValues?.[0]?.value),
        rowCount: response.data.rowCount ?? 0,
      },
    };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const config = configSchema.parse(ctx.source.config);
    if (ctx.signal.aborted) throw new Error("同期がタイムアウトしました。");
    const analytics = await createAnalyticsClient(config.credentialSecretName);
    const periodEnd = jstDate(-1);
    const periodStart = jstDate(-config.lookbackDays);
    const property = `properties/${config.propertyId}`;

    const [summaryResponse, pageResponse] = await Promise.all([
      analytics.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
          metrics: [
            { name: "sessions" },
            { name: "activeUsers" },
            { name: "screenPageViews" },
            { name: "engagementRate" },
            { name: "averageSessionDuration" },
          ],
          limit: "1",
        },
      }),
      analytics.properties.runReport({
        property,
        requestBody: {
          dateRanges: [{ startDate: periodStart, endDate: periodEnd }],
          dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
          metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "10",
        },
      }),
    ]);
    if (ctx.signal.aborted) throw new Error("同期がタイムアウトしました。");

    const totals = reportRows(summaryResponse.data)[0] ?? { dimensions: [], metrics: [] };
    const [sessions = 0, activeUsers = 0, pageViews = 0, engagementRate = 0, averageSessionDuration = 0] = totals.metrics;
    const topPages = reportRows(pageResponse.data).map((row) => ({
      path: row.dimensions[0] || "/",
      title: row.dimensions[1] || "（タイトルなし）",
      views: row.metrics[0] ?? 0,
      activeUsers: row.metrics[1] ?? 0,
    }));
    const report = {
      provider: "google_analytics",
      propertyId: config.propertyId,
      siteUrl: config.siteUrl,
      periodStart,
      periodEnd,
      totals: { sessions, activeUsers, pageViews, engagementRate, averageSessionDuration },
      topPages,
    };
    const reportHash = hash(report);
    const unchanged = ctx.cursor.normalizationVersion === NORMALIZATION_VERSION && ctx.cursor.reportHash === reportHash;
    const externalId = `ga4:${config.propertyId}:${periodStart}:${periodEnd}`;
    const sourceUrl = "https://analytics.google.com/analytics/web/";
    const title = `公式サイトアクセス集計（${periodStart}〜${periodEnd}）`;
    const topPageText = topPages.slice(0, 5).map((page, index) => `${index + 1}. ${page.title}（${formatNumber(page.views)}表示）`).join("\n");
    const summary = [
      `${config.lookbackDays}日間の公式サイトは、セッション${formatNumber(sessions)}件、アクティブユーザー${formatNumber(activeUsers)}人、ページ表示${formatNumber(pageViews)}回でした。`,
      `エンゲージメント率は${formatNumber(engagementRate * 100, 1)}%、平均セッション時間は${formatNumber(averageSessionDuration, 1)}秒です。`,
      topPageText ? `よく読まれたページ:\n${topPageText}` : "ページ別データはありませんでした。",
    ].join("\n\n");

    const object: NormalizedSourceObject = {
      externalId,
      objectType: "google_analytics_report",
      sourceRevision: reportHash,
      title,
      safeExcerpt: summary.slice(0, 1_000),
      sourceUrl,
      occurredAt: new Date().toISOString(),
      periodStart,
      periodEnd,
      contentHash: reportHash,
      locator: { provider: "google_analytics", propertyId: config.propertyId, periodStart, periodEnd },
      metadata: report,
      privacyLevel: 1,
      publishability: "internal_only",
      containsPersonalData: false,
    };
    const proposal: ProposedKnowledge = {
      knowledgeKey: `ga4:${config.propertyId}:summary:${periodStart}:${periodEnd}`,
      knowledgeType: "web_analytics_summary",
      title,
      summary,
      sourceUrl,
      occurredAt: object.occurredAt,
      periodStart,
      periodEnd,
      category: ctx.source.default_category ?? "Web・広報",
      tags: ["Google Analytics", "公式サイト", "アクセス解析", "コンテンツ改善"],
      importance: 3,
      confidence: 1,
      privacyLevel: 1,
      publishability: "internal_only",
      authorship: "source",
      evidenceExternalIds: [externalId],
      metadata: { provider: "google_analytics", propertyId: config.propertyId, totals: report.totals, topPages },
    };

    return {
      objects: unchanged ? [] : [object],
      proposedKnowledge: unchanged ? [] : [proposal],
      nextCursor: {
        normalizationVersion: NORMALIZATION_VERSION,
        propertyId: config.propertyId,
        periodStart,
        periodEnd,
        reportHash,
        lastFetchedAt: new Date().toISOString(),
      },
      hasMore: false,
      warnings: ["個人単位のデータは取得せず、集計値と上位ページだけを内部ナレッジとして保存します。"],
    };
  },
};
