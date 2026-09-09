import type {
  MoneyForwardTransitionReport,
  MoneyForwardTransitionRow,
} from "@/lib/moneyforward/client";

export type MoneyForwardCompactMetric = {
  name: string;
  path: string;
  type: string;
  values: number[];
};

export type MoneyForwardCompactReport = {
  reportType: "transition_pl" | "transition_bs";
  fiscalYear: number;
  startMonth: number;
  endMonth: number;
  columns: string[];
  metrics: MoneyForwardCompactMetric[];
};

function collectMetrics(
  rows: MoneyForwardTransitionRow[],
  parents: string[] = [],
  depth = 0
): MoneyForwardCompactMetric[] {
  const metrics: MoneyForwardCompactMetric[] = [];
  for (const row of rows ?? []) {
    const name = String(row.name ?? "").trim();
    if (!name) continue;
    const path = [...parents, name];
    const values = Array.isArray(row.values)
      ? row.values.map(Number).map((value) => Number.isFinite(value) ? value : 0)
      : [];
    const important = /(売上|利益|損失|人件費|給与|給料|賞与|法定福利|福利厚生|外注|現金|預金|資産|負債|純資産)/.test(name);
    if (values.length && (depth <= 1 || important)) {
      metrics.push({ name, path: path.join(" > "), type: String(row.type ?? ""), values });
    }
    if (Array.isArray(row.rows) && row.rows.length) {
      metrics.push(...collectMetrics(row.rows, path, depth + 1));
    }
  }
  return metrics.slice(0, 120);
}

export function compactMoneyForwardReport(
  report: MoneyForwardTransitionReport
): MoneyForwardCompactReport {
  return {
    reportType: report.report_type,
    fiscalYear: Number(report.fiscal_year),
    startMonth: Number(report.start_month),
    endMonth: Number(report.end_month),
    columns: (report.columns ?? []).map(String),
    metrics: collectMetrics(report.rows ?? []),
  };
}

function latestMonthlyColumn(report: MoneyForwardCompactReport) {
  const candidates = report.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => /^\d{1,2}$/.test(column));
  for (const candidate of [...candidates].reverse()) {
    if (report.metrics.some((metric) => Number(metric.values[candidate.index] ?? 0) !== 0)) {
      return candidate;
    }
  }
  return candidates.at(-1) ?? {
    column: String(report.endMonth),
    index: Math.max(0, report.columns.length - 1),
  };
}

function findMetric(report: MoneyForwardCompactReport, patterns: RegExp[], index: number) {
  for (const pattern of patterns) {
    const metric = report.metrics.find((item) => pattern.test(item.name));
    if (metric) return Number(metric.values[index] ?? 0);
  }
  return null;
}

function yen(value: number | null) {
  return value === null ? "—" : `${Math.round(value).toLocaleString("ja-JP")}円`;
}

export function summarizeMoneyForwardReports(
  tenantName: string,
  fiscalYear: number,
  pl: MoneyForwardCompactReport,
  bs: MoneyForwardCompactReport
) {
  const latest = latestMonthlyColumn(pl);
  const revenue = findMetric(pl, [/^売上高合計$/, /^売上高$/, /売上.*合計/], latest.index);
  const operatingProfit = findMetric(pl, [/^営業利益$/, /営業利益/], latest.index);
  const ordinaryProfit = findMetric(pl, [/^経常利益$/, /経常利益/], latest.index);
  const netIncome = findMetric(pl, [/当期.*純利益/, /当期.*利益/], latest.index);
  const bsIndex = Math.min(latest.index, Math.max(0, bs.columns.length - 1));
  const cash = findMetric(bs, [/現金及び預金合計/, /現金.*預金/], bsIndex);
  const totalAssets = findMetric(bs, [/資産の部合計/, /^資産合計$/], bsIndex);
  const monthLabel = `${fiscalYear}年度 ${latest.column}月`;
  const lines = [
    `${tenantName}の${monthLabel}のMoney Forward月次財務データです。`,
    `売上高 ${yen(revenue)}、営業利益 ${yen(operatingProfit)}、経常利益 ${yen(ordinaryProfit)}、当期純利益 ${yen(netIncome)}。`,
    `現金・預金 ${yen(cash)}、資産合計 ${yen(totalAssets)}。`,
  ];
  return { monthLabel, summary: lines.join(""), content: lines.join("\n") };
}
