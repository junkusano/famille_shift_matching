export const RECRUITMENT_REPORT_TYPE = "recruitment_analytics_report";
export const RECRUITMENT_TARGETS = ["https://myfamille.shi-on.net/", "https://shi-on.net/recruiting/", "https://myfamille.shi-on.net/entry"];
const DAY = 86_400_000;

export function recruitmentPeriods(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3_600_000);
  const monday = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - (jst.getUTCDay() + 6) % 7);
  const period = (start: number) => ({
    start: new Date(start).toISOString().slice(0, 10), end: new Date(start + 6 * DAY).toISOString().slice(0, 10),
    from: new Date(start - 9 * 3_600_000).toISOString(), until: new Date(start + 7 * DAY - 9 * 3_600_000).toISOString(),
  });
  return { current: period(monday - 7 * DAY), previous: period(monday - 14 * DAY) };
}

// Keep public page paths only. Never retain query strings, application IDs or portal paths.
export function publicRecruitmentUrl(host: string, path: string) {
  host = host.toLowerCase().replace(/^www\./, "");
  path = path.split(/[?#]/)[0];
  if (!path.startsWith("/") || /@|%40|[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(path)) return null;
  if (host === "myfamille.shi-on.net") return /^\/(?:entry\/?)?$/.test(path) ? `https://${host}${path.replace(/\/$/, "") || "/"}` : null;
  if (host !== "shi-on.net" || /^\/(?:wp-admin|wp-login|wp-json|portal|api)(?:\/|\.|$)/i.test(path)) return null;
  return `https://${host}${path}`;
}

export function referrerCategory(value: string) {
  try {
    const url = new URL(value);
    const safe = publicRecruitmentUrl(url.hostname, url.pathname);
    if (safe === RECRUITMENT_TARGETS[0]) return "MyFamille LP";
    if (safe && /^https:\/\/shi-on.net\/recruiting\/?$/.test(safe)) return "採用LP";
    if (safe?.startsWith("https://shi-on.net/")) return safe;
    return "その他の参照元";
  } catch { return "参照元不明"; }
}

export function countChange(current: number | null, previous: number | null) {
  if (current === null || previous === null) return { difference: null, percent: null };
  return { difference: current - previous, percent: previous === 0 ? null : Math.round((current - previous) / previous * 1000) / 10 };
}

export type RecruitmentPeriod = ReturnType<typeof recruitmentPeriods>["current"];
export type AnalyticsTable = { label: string; columns: string[]; rows: Array<Array<string | number>>; limited: boolean };
export type AnalyticsWeek = { period: RecruitmentPeriod; entries: number | null; tables: AnalyticsTable[]; warnings: string[] };
export type RecruitmentReport = {
  periods: ReturnType<typeof recruitmentPeriods>; current: AnalyticsWeek; previous: AnalyticsWeek;
  clarity: Array<{ id: string; title: string; period_start: string | null; period_end: string | null; summary: string }>;
  knowledge: Array<{ id: string; title: string; summary: string }>;
  overview: string; routeAssessment: string; contentAssessment: string;
  improvements: Array<{ priority: string; target: string; evidence: string; hypothesis: string; action: string; metric: string; discussion: string }>;
  limitations: string[]; generatedAt: string;
};
