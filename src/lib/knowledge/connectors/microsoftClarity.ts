import "server-only";

import { createHash } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/service";
import type {
  ConnectorResult,
  KnowledgeConnector,
  NormalizedSourceObject,
  ProposedKnowledge,
} from "@/lib/knowledge/types";

const dimensionSchema = z.enum(["Browser", "Device", "Country/Region", "OS", "Source", "Medium", "Campaign", "Channel", "URL"]);
const configSchema = z.object({
  numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
  dimensions: z.array(dimensionSchema).max(3).default(["URL"]),
  siteUrl: z.string().url().default("https://www.shi-on.net/"),
  tokenSecretName: z.string().trim().min(1).default("clarity_data_export_api_token"),
});

type ClarityMetric = {
  metricName: string;
  information: Array<Record<string, unknown>>;
};

const NORMALIZATION_VERSION = 1;
const API_URL = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jstDate(offsetDays: number) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1_000);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function sanitizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value === "string" && /url|referrer/i.test(key)) return [key, safeUrl(value)];
    return [key, value];
  }));
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function sumFields(rows: Array<Record<string, unknown>>, patterns: RegExp[]) {
  return rows.reduce((total, row) => total + Object.entries(row).reduce((rowTotal, [key, value]) => {
    return patterns.some((pattern) => pattern.test(key)) ? rowTotal + numberValue(value) : rowTotal;
  }, 0), 0);
}

async function readToken(secretName: string) {
  const { data, error } = await supabaseAdmin.rpc("read_secret", { secret_name: secretName });
  if (error || typeof data !== "string" || !data.trim()) {
    throw new Error("Microsoft ClarityのData Export APIトークンを取得できませんでした。");
  }
  return data.trim();
}

async function fetchReport(
  config: z.infer<typeof configSchema>,
  signal: AbortSignal,
  dimensions: z.infer<typeof dimensionSchema>[] = config.dimensions
) {
  const token = await readToken(config.tokenSecretName);
  const url = new URL(API_URL);
  url.searchParams.set("numOfDays", String(config.numOfDays));
  dimensions.forEach((dimension, index) => url.searchParams.set(`dimension${index + 1}`, dimension));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error("Microsoft Clarityの認証または権限を確認してください。");
    if (response.status === 429) throw new Error("Microsoft Clarity APIの日次上限に達しました。翌日に再実行してください。");
    throw new Error(`Microsoft Clarity APIの取得に失敗しました（${response.status}）。`);
  }
  const parsed = await response.json() as unknown;
  const schema = z.array(z.object({
    metricName: z.string(),
    information: z.array(z.record(z.string(), z.unknown())).default([]),
  }));
  return schema.parse(parsed).map((metric) => ({
    metricName: metric.metricName,
    information: metric.information.slice(0, 1_000).map(sanitizeRow),
  })) satisfies ClarityMetric[];
}

function findMetric(metrics: ClarityMetric[], name: RegExp) {
  return metrics.find((metric) => name.test(metric.metricName))?.information ?? [];
}

function labelForRow(row: Record<string, unknown>) {
  const value = row.URL ?? row.Url ?? row.url ?? row.PageTitle ?? row.pageTitle ?? row.Title;
  return typeof value === "string" && value.trim() ? value.trim() : "（ページ情報なし）";
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(value);
}

export const microsoftClarityConnector: KnowledgeConnector = {
  key: "microsoft_clarity",

  async testConnection(ctx) {
    const config = configSchema.parse(ctx.source.config);
    const metrics = await fetchReport({ ...config, numOfDays: 1 }, ctx.signal, []);
    return { ok: true, details: { metricCount: metrics.length, metrics: metrics.map((metric) => metric.metricName) } };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const config = configSchema.parse(ctx.source.config);
    const [metrics, breakdownMetrics] = await Promise.all([
      fetchReport(config, ctx.signal, []),
      fetchReport(config, ctx.signal, config.dimensions),
    ]);
    const periodEnd = jstDate(0);
    const periodStart = jstDate(-(config.numOfDays - 1));
    const trafficRows = findMetric(metrics, /^Traffic$/i);
    const popularRows = findMetric(breakdownMetrics, /Popular Pages/i);
    const breakdownTrafficRows = findMetric(breakdownMetrics, /^Traffic$/i);
    const engagementRows = findMetric(metrics, /Engagement Time/i);
    const rageRows = findMetric(metrics, /Rage Click/i);
    const deadRows = findMetric(metrics, /Dead Click/i);
    const quickbackRows = findMetric(metrics, /Quickback/i);
    const sessions = sumFields(trafficRows, [/^totalSessionCount$/i]);
    const botSessions = sumFields(trafficRows, [/^totalBotSessionCount$/i]);
    const users = sumFields(trafficRows, [/^(distinct|distant)UserCount$/i]);
    const rageClicks = sumFields(rageRows, [/count/i]);
    const deadClicks = sumFields(deadRows, [/count/i]);
    const quickbacks = sumFields(quickbackRows, [/count/i]);
    const topPages = (popularRows.length ? popularRows : breakdownTrafficRows).slice(0, 10).map((row) => ({
      label: labelForRow(row),
      sessions: sumFields([row], [/sessioncount/i, /^Traffic$/i]),
    })).sort((a, b) => b.sessions - a.sessions);
    const report = {
      provider: "microsoft_clarity",
      siteUrl: config.siteUrl,
      periodStart,
      periodEnd,
      numOfDays: config.numOfDays,
      dimensions: config.dimensions,
      summary: { sessions, botSessions, users, rageClicks, deadClicks, quickbacks },
      topPages,
      engagement: engagementRows.slice(0, 100),
      metrics,
      breakdownMetrics,
    };
    const reportHash = hash(report);
    const unchanged = ctx.cursor.normalizationVersion === NORMALIZATION_VERSION && ctx.cursor.reportHash === reportHash;
    const externalId = `clarity:${periodStart}:${periodEnd}`;
    const sourceUrl = "https://clarity.microsoft.com/";
    const title = `公式サイト行動分析（${periodStart}〜${periodEnd}）`;
    const topPageText = topPages.slice(0, 5).map((page, index) => `${index + 1}. ${page.label}${page.sessions ? `（${formatNumber(page.sessions)}セッション）` : ""}`).join("\n");
    const summary = [
      `${config.numOfDays}日間のClarity集計は、セッション${formatNumber(sessions)}件、ユーザー${formatNumber(users)}人でした（bot判定 ${formatNumber(botSessions)}件）。`,
      `操作上のつまずき候補は、Rage Click ${formatNumber(rageClicks)}件、Dead Click ${formatNumber(deadClicks)}件、Quickback ${formatNumber(quickbacks)}件です。`,
      topPageText ? `よく見られたページ:\n${topPageText}` : "ページ別データはありませんでした。",
    ].join("\n\n");
    const object: NormalizedSourceObject = {
      externalId,
      objectType: "microsoft_clarity_report",
      sourceRevision: reportHash,
      title,
      safeExcerpt: summary.slice(0, 1_000),
      sourceUrl,
      occurredAt: new Date().toISOString(),
      periodStart,
      periodEnd,
      contentHash: reportHash,
      locator: { provider: "microsoft_clarity", periodStart, periodEnd, dimensions: config.dimensions },
      metadata: report,
      privacyLevel: 1,
      publishability: "internal_only",
      containsPersonalData: false,
    };
    const proposal: ProposedKnowledge = {
      knowledgeKey: `clarity:summary:${periodStart}:${periodEnd}`,
      knowledgeType: "web_behavior_summary",
      title,
      summary,
      sourceUrl,
      occurredAt: object.occurredAt,
      periodStart,
      periodEnd,
      category: ctx.source.default_category ?? "Web・広報",
      tags: ["Microsoft Clarity", "公式サイト", "行動分析", "UX改善"],
      importance: rageClicks + deadClicks + quickbacks > 0 ? 4 : 3,
      confidence: 1,
      privacyLevel: 1,
      publishability: "internal_only",
      authorship: "source",
      evidenceExternalIds: [externalId],
      metadata: { provider: "microsoft_clarity", summary: report.summary, topPages },
    };

    return {
      objects: unchanged ? [] : [object],
      proposedKnowledge: unchanged ? [] : [proposal],
      nextCursor: {
        normalizationVersion: NORMALIZATION_VERSION,
        periodStart,
        periodEnd,
        reportHash,
        lastFetchedAt: new Date().toISOString(),
      },
      hasMore: false,
      warnings: ["Clarityの上限（1日10回、直近3日）を守るため、毎日1回の集計取得を想定しています。個別セッションや録画は保存しません。"],
    };
  },
};
