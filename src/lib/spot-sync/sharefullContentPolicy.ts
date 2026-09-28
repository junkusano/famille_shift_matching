export type SharefullContentPolicyStatus = "clean" | "transformed" | "blocked";

export type SharefullContentPolicyFinding = {
  ruleId: string;
  action: "replace" | "block";
  field: string;
  matchedText: string;
  replacement?: string;
};

export type SharefullContentPolicyReport = {
  status: SharefullContentPolicyStatus;
  findings: SharefullContentPolicyFinding[];
};

const PUBLIC_TEXT_FIELDS = [
  "template_title",
  "work_description",
  "cautions",
  "auto_message",
  "matching_msg",
] as const;

const PUBLIC_ENV_FIELDS = [
  "sukima_detail",
  "sukima_automsg",
  "sukima_koudou",
  "sukima_caution",
] as const;

const EXACT_REPLACEMENTS = [
  {
    ruleId: "taimee-listing-banner",
    from: "タイミー掲載のお仕事はごく一部です！",
    to: "シェアフル掲載のお仕事はごく一部です！",
  },
] as const;

const BLOCKED_PATTERNS = [
  { ruleId: "taimee-brand", pattern: /タイミー|Timee/i },
  { ruleId: "taimee-url", pattern: /(?:https?:\/\/)?(?:www\.)?timee\.(?:co\.jp|jp)\S*/i },
  { ruleId: "gender-sensitive-recruiting", pattern: /女性ヘルパー|女性の利用者|女性の下着|女性限定|男性不可/ },
] as const;

type TextSource = Record<string, unknown>;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function replaceExact(value: string, field: string, findings: SharefullContentPolicyFinding[]) {
  let next = value;
  for (const rule of EXACT_REPLACEMENTS) {
    if (!next.includes(rule.from)) continue;
    findings.push({
      ruleId: rule.ruleId,
      action: "replace",
      field,
      matchedText: rule.from,
      replacement: rule.to,
    });
    next = next.split(rule.from).join(rule.to);
  }
  return next;
}

function collectPublicText(source: TextSource): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = PUBLIC_TEXT_FIELDS.flatMap((field) => {
    const value = source[field];
    return isText(value) ? [{ field, value }] : [];
  });
  const env = source.env;
  if (env && typeof env === "object") {
    for (const field of PUBLIC_ENV_FIELDS) {
      const value = (env as TextSource)[field];
      if (isText(value)) fields.push({ field: `env.${field}`, value });
    }
  }
  return fields;
}

export function applySharefullContentPolicy<T extends TextSource>(source: T): {
  data: T;
  report: SharefullContentPolicyReport;
} {
  const findings: SharefullContentPolicyFinding[] = [];
  const data: TextSource = { ...source };

  for (const field of PUBLIC_TEXT_FIELDS) {
    const value = data[field];
    if (isText(value)) data[field] = replaceExact(value, field, findings);
  }

  if (data.env && typeof data.env === "object") {
    data.env = { ...(data.env as TextSource) };
    for (const field of PUBLIC_ENV_FIELDS) {
      const value = (data.env as TextSource)[field];
      if (isText(value)) (data.env as TextSource)[field] = replaceExact(value, `env.${field}`, findings);
    }
  }

  for (const { field, value } of collectPublicText(data)) {
    for (const rule of BLOCKED_PATTERNS) {
      const match = value.match(rule.pattern);
      if (!match) continue;
      findings.push({ ruleId: rule.ruleId, action: "block", field, matchedText: match[0] });
    }
  }

  const status: SharefullContentPolicyStatus = findings.some((finding) => finding.action === "block")
    ? "blocked"
    : findings.length > 0
      ? "transformed"
      : "clean";

  return { data: data as T, report: { status, findings } };
}
