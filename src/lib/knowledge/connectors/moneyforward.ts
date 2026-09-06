import "server-only";

import { createHash } from "crypto";
import type { ConnectorContext, ConnectorResult, KnowledgeConnector, NormalizedSourceObject } from "@/lib/knowledge/types";
import {
  getMoneyForwardAccountingOffice,
  getMoneyForwardTenant,
  getMoneyForwardTransitionReport,
  type MoneyForwardAccountingPeriod,
} from "@/lib/moneyforward/client";
import {
  compactMoneyForwardReport,
  summarizeMoneyForwardReports,
} from "@/lib/moneyforward/financial";
import { getMoneyForwardAccessToken } from "@/lib/moneyforward/tokens";

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readConnection(ctx: ConnectorContext) {
  if (!ctx.source.integration_id) throw new Error("Money Forwardを先に接続してください。");
  const accessToken = await getMoneyForwardAccessToken(ctx.source.integration_id);
  const tenant = await getMoneyForwardTenant(accessToken);
  return { accessToken, tenant };
}

function latestPeriod(periods: MoneyForwardAccountingPeriod[]) {
  return [...(periods ?? [])].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0];
}

export const moneyForwardConnector: KnowledgeConnector = {
  key: "moneyforward",

  async testConnection(ctx) {
    const { accessToken, tenant } = await readConnection(ctx);
    const office = await getMoneyForwardAccountingOffice(accessToken);
    return {
      ok: true,
      details: {
        accountId: tenant.accountId,
        accountName: tenant.accountName,
        accountingOffice: office.name,
        fiscalYears: (office.accounting_periods ?? []).map((period) => period.fiscal_year),
      },
    };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const { accessToken, tenant } = await readConnection(ctx);
    const office = await getMoneyForwardAccountingOffice(accessToken);
    const period = latestPeriod(office.accounting_periods);
    if (!period) throw new Error("Money Forward会計年度を取得できませんでした。");

    const [plRaw, bsRaw] = await Promise.all([
      getMoneyForwardTransitionReport(accessToken, "transition_pl", period.fiscal_year),
      getMoneyForwardTransitionReport(accessToken, "transition_bs", period.fiscal_year),
    ]);
    const pl = compactMoneyForwardReport(plRaw);
    const bs = compactMoneyForwardReport(bsRaw);
    const fetchedAt = new Date().toISOString();
    const tenantHash = hash({ accountId: tenant.accountId, accountName: tenant.accountName, metadata: tenant.metadata });
    const plHash = hash(pl);
    const bsHash = hash(bs);
    const tenantChanged = ctx.cursor.tenantHash !== tenantHash;
    const plChanged = ctx.cursor.plHash !== plHash;
    const bsChanged = ctx.cursor.bsHash !== bsHash;
    const sourceUrl = "https://accounting.moneyforward.com/";
    const objects: NormalizedSourceObject[] = [];

    if (tenantChanged) {
      objects.push({
        externalId: `tenant:${tenant.accountId}`,
        objectType: "moneyforward_tenant",
        sourceRevision: tenantHash,
        title: `Money Forward: ${tenant.accountName}`,
        safeExcerpt: "Money Forwardクラウド会計の接続先情報",
        occurredAt: fetchedAt,
        contentHash: tenantHash,
        locator: { provider: "moneyforward", accountId: tenant.accountId },
        metadata: { accountName: tenant.accountName, accountingOffice: office.name, ...tenant.metadata },
        privacyLevel: 2,
        publishability: "internal_only",
        containsPersonalData: false,
      });
    }

    const reports = [
      { report: pl, reportHash: plHash, changed: plChanged },
      { report: bs, reportHash: bsHash, changed: bsChanged },
    ];
    for (const entry of reports) {
      if (!entry.changed) continue;
      objects.push({
        externalId: `${entry.report.reportType}:${period.fiscal_year}`,
        objectType: `moneyforward_${entry.report.reportType}`,
        sourceRevision: `${period.fiscal_year}:${entry.reportHash}`,
        title: `${period.fiscal_year}年度 ${entry.report.reportType === "transition_pl" ? "月次損益推移" : "月次貸借推移"}`,
        sourceUrl,
        occurredAt: fetchedAt,
        periodStart: period.start_date,
        periodEnd: period.end_date,
        contentHash: entry.reportHash,
        locator: {
          provider: "moneyforward",
          accountId: tenant.accountId,
          reportType: entry.report.reportType,
          fiscalYear: period.fiscal_year,
        },
        metadata: entry.report,
        privacyLevel: 2,
        publishability: "internal_only",
        containsPersonalData: false,
      });
    }

    const summary = summarizeMoneyForwardReports(tenant.accountName, period.fiscal_year, pl, bs);
    const reportChanged = plChanged || bsChanged;

    return {
      objects,
      proposedKnowledge: reportChanged ? [{
        knowledgeKey: `moneyforward:${tenant.accountId}:financial-summary:${period.fiscal_year}`,
        knowledgeType: "financial_summary",
        title: `${summary.monthLabel} Money Forward財務サマリー`,
        summary: summary.summary,
        content: summary.content,
        sourceUrl,
        occurredAt: fetchedAt,
        periodStart: period.start_date,
        periodEnd: period.end_date,
        category: "経営・財務",
        tags: ["Money Forward", "月次財務", "PL", "BS", String(period.fiscal_year)],
        importance: 4,
        confidence: 1,
        privacyLevel: 2,
        publishability: "internal_only",
        authorship: "source",
        evidenceExternalIds: reports
          .filter((entry) => entry.changed)
          .map((entry) => `${entry.report.reportType}:${period.fiscal_year}`),
        metadata: {
          provider: "moneyforward",
          accountId: tenant.accountId,
          fiscalYear: period.fiscal_year,
          month: summary.monthLabel,
        },
      }] : [],
      nextCursor: {
        tenantId: tenant.accountId,
        fiscalYear: period.fiscal_year,
        tenantHash,
        plHash,
        bsHash,
        lastFetchedAt: fetchedAt,
      },
      hasMore: false,
      warnings: ["読み取り専用で月次PL・BS推移を取得しています。仕訳明細そのものはナレッジへ保存しません。"],
    };
  },
};
