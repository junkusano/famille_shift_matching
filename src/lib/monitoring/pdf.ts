import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import type {
  MonitoringGoal,
  MonitoringRecord,
  MonitoringServiceType,
} from "@/types/monitoring";
import {
  MONITORING_ACHIEVEMENT_LABELS,
  MONITORING_SERVICE_LABELS,
  formatMonitoringPeriod,
} from "./core";

type PdfContext = {
  client_name: string;
  care_level: string;
  office_name: string;
  destination_office: string;
  care_manager_name: string;
};

export type MonitoringPdfSnapshot = {
  monitoring: MonitoringRecord;
  goals: MonitoringGoal[];
  context: PdfContext;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function multiline(value: unknown): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

async function embeddedFontCss(): Promise<string> {
  const fontDir = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-jp",
    "files",
  );
  const [regular, bold] = await Promise.all([
    fs.readFile(path.join(fontDir, "noto-sans-jp-japanese-400-normal.woff2")),
    fs.readFile(path.join(fontDir, "noto-sans-jp-japanese-700-normal.woff2")),
  ]);
  return `
    @font-face { font-family: MonitoringJP; src: url(data:font/woff2;base64,${regular.toString(
      "base64",
    )}) format("woff2"); font-weight: 400; }
    @font-face { font-family: MonitoringJP; src: url(data:font/woff2;base64,${bold.toString(
      "base64",
    )}) format("woff2"); font-weight: 700; }
  `;
}

async function chromiumExecutablePath(): Promise<string> {
  const configured = process.env.MONITORING_CHROME_PATH?.trim();
  const windowsCandidates = [
    configured,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((candidate): candidate is string => Boolean(candidate));
  if (process.platform === "win32") {
    for (const candidate of windowsCandidates) {
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // 次の候補を確認する。
      }
    }
  }
  return chromium.executablePath();
}

function sharedStyles(fontCss: string, serviceType: MonitoringServiceType): string {
  return `${fontCss}
    @page { size: A4 ${serviceType === "care_insurance" ? "landscape" : "portrait"}; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: MonitoringJP, sans-serif; font-size: 10.5px; line-height: 1.55; }
    h1 { margin: 0 0 8px; text-align: center; font-size: 20px; letter-spacing: .12em; }
    h2 { margin: 12px 0 5px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #374151; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f3f4f6; font-weight: 700; text-align: center; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .section { margin-top: 7px; }
    .label { width: 16%; }
    .goal { margin-top: 7px; break-inside: avoid; page-break-inside: avoid; }
    .goal-title { background: #e5e7eb; font-weight: 700; }
    .muted { color: #4b5563; font-size: 9.5px; }
    .notice { white-space: pre-wrap; min-height: 45px; }
    .footer { margin-top: 10px; border-top: 1px solid #9ca3af; padding-top: 5px; color: #4b5563; font-size: 9px; }
    .summary { white-space: pre-wrap; }
    .compact td, .compact th { padding: 4px 5px; }
  `;
}

function careInsuranceBody(snapshot: MonitoringPdfSnapshot): string {
  const { monitoring, goals, context } = snapshot;
  return `
    <div class="meta"><span>${escapeHtml(
      MONITORING_SERVICE_LABELS[monitoring.service_type],
    )}</span><span>評価日 ${escapeHtml(monitoring.evaluation_date)}</span></div>
    <h1>モニタリングシート</h1>
    <table class="compact">
      <tr><th>利用者名</th><td>${escapeHtml(context.client_name)} 様</td><th>要介護度等</th><td>${escapeHtml(
        context.care_level,
      )}</td><th>事業者名</th><td>${escapeHtml(context.office_name)}</td></tr>
      <tr><th>居宅介護支援事業者</th><td colspan="2">${escapeHtml(
        context.destination_office,
      )}</td><th>担当ケアマネジャー</th><td colspan="2">${escapeHtml(
        context.care_manager_name,
      )}</td></tr>
      <tr><th>対象期間</th><td colspan="5">${escapeHtml(
        formatMonitoringPeriod(monitoring.period_start, monitoring.period_end),
      )}</td></tr>
    </table>
    <table class="section">
      <tr><th class="label">本人の希望</th><td>${multiline(monitoring.client_request)}</td></tr>
      <tr><th>家族の希望</th><td>${multiline(monitoring.family_request)}</td></tr>
      <tr><th>解決すべき課題</th><td>${multiline(monitoring.issues)}</td></tr>
      <tr><th>全体経過</th><td class="summary">${multiline(monitoring.summary)}</td></tr>
    </table>
    <h2>目標ごとの評価</h2>
    ${goals
      .map(
        (goal) => `
      <table class="goal">
        <tr><th style="width:12%">${goal.goal_type === "long_term" ? "長期目標" : "短期目標"}</th><td colspan="5" class="goal-title">${multiline(
          goal.goal_text,
        )}</td></tr>
        <tr><th>評価期間</th><td style="width:20%">${escapeHtml(
          goal.evaluation_start ?? "",
        )} ～ ${escapeHtml(goal.evaluation_end ?? "")}</td><th style="width:12%">達成状況</th><td style="width:16%">${escapeHtml(
          MONITORING_ACHIEVEMENT_LABELS[goal.achievement_status],
        )}</td><th style="width:14%">見直し必要性</th><td>${goal.review_required ? "あり" : "なし"}</td></tr>
        <tr><th>特記事項／評価</th><td colspan="5">${multiline(goal.evaluation_text)}</td></tr>
        <tr><th>変更内容・共有事項</th><td colspan="5">${multiline(goal.review_content)}</td></tr>
      </table>`,
      )
      .join("")}
    <table class="section"><tr><th class="label">事業所より</th><td class="notice">${multiline(
      monitoring.office_notice,
    )}</td></tr></table>
  `;
}

function disabilityBody(snapshot: MonitoringPdfSnapshot): string {
  const { monitoring, goals, context } = snapshot;
  const assistanceGoals = goals
    .map(
      (goal) => `${goal.goal_type === "long_term" ? "長期" : "短期"}：${goal.goal_text}`,
    )
    .join("\n");
  const monitoringText = [
    monitoring.summary,
    ...goals.map(
      (goal) =>
        `【${goal.goal_text}】${MONITORING_ACHIEVEMENT_LABELS[goal.achievement_status]}：${goal.evaluation_text}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
  return `
    <div style="font-size:13px;margin-bottom:9px;">${escapeHtml(
      context.destination_office || "相談支援事業所",
    )}　御中</div>
    <div style="margin-bottom:12px;">以下の通り、モニタリングをお送りします。ご査収の程、よろしくお願いいたします。</div>
    <h1>モニタリングメモ</h1>
    <table>
      <tr><th class="label">事業所名</th><td>${escapeHtml(context.office_name)}</td></tr>
      <tr><th>サービス実施期間</th><td>${escapeHtml(
        formatMonitoringPeriod(monitoring.period_start, monitoring.period_end),
      )}</td></tr>
      <tr><th>評価日</th><td>${escapeHtml(monitoring.evaluation_date)}</td></tr>
      <tr><th>利用者名</th><td>${escapeHtml(context.client_name)} 様</td></tr>
      <tr><th>援助目標</th><td class="notice">${multiline(assistanceGoals || monitoring.issues)}</td></tr>
      <tr><th>モニタリング</th><td class="notice">${multiline(monitoringText)}</td></tr>
      <tr><th>事業所より</th><td class="notice">${multiline(monitoring.office_notice)}</td></tr>
    </table>
  `;
}

export async function buildMonitoringHtml(snapshot: MonitoringPdfSnapshot): Promise<string> {
  const fontCss = await embeddedFontCss();
  const body =
    snapshot.monitoring.service_type === "care_insurance"
      ? careInsuranceBody(snapshot)
      : disabilityBody(snapshot);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><style>${sharedStyles(
    fontCss,
    snapshot.monitoring.service_type,
  )}</style></head><body>${body}<div class="footer">サービス提供責任者が内容を確認した確定版です。PDF作成日時：${escapeHtml(
    new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
  )}</div></body></html>`;
}

export async function renderMonitoringPdf(snapshot: MonitoringPdfSnapshot): Promise<Buffer> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromiumExecutablePath(),
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(await buildMonitoringHtml(snapshot), { waitUntil: "load" });
    const bytes = await page.pdf({
      format: "A4",
      landscape: snapshot.monitoring.service_type === "care_insurance",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return Buffer.from(bytes);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
