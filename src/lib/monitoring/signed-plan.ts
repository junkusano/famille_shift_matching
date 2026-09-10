import "server-only";

import {
  rerunCsDocOcr,
  rerunCsDocSummary,
} from "@/lib/cs-docs-reprocess";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { MonitoringSignedPlan } from "@/types/monitoring";
import { cleanMonitoringGoalText } from "./core";

type CsDocRow = {
  id: string;
  doc_name: string | null;
  applicable_date: string | null;
  doc_date_raw: string | null;
  created_at: string;
  ocr_text: string | null;
  summary: string | null;
};

type FieldSpec = {
  labels: RegExp[];
  stops: RegExp[];
};

const SIGNED_PLAN_NAME = /(?:訪問介護計画書|訪問介護予防計画書|介護予防訪問介護計画書|居宅介護計画書|重度訪問介護計画書|同行援護計画書|行動援護計画書|移動支援計画書|障害サービス計画書|障害(?:福祉サービス)?(?:個別)?計画書|重度就労計画書|介護計画書)/;

export function isMonitoringSignedPlanName(value: unknown): boolean {
  return SIGNED_PLAN_NAME.test(text(value));
}
const COMMON_STOPS = [
  /本人\s*[（(]\s*家族\s*[）)]\s*の希望/,
  /本人の希望/,
  /家族の希望/,
  /援助目標/,
  /長期目標/,
  /短期目標/,
  /解決すべき課題/,
  /生活上の課題/,
  /サービス内容/,
  /利用目標/,
  /計画予定表/,
  /計画期間/,
  /備考/,
];

const PERSON_FAMILY_HOPE: FieldSpec = {
  labels: [/本人\s*[（(]\s*家族\s*[）)]\s*の希望/, /本人及び家族の希望/],
  stops: COMMON_STOPS,
};
const PERSON_HOPE: FieldSpec = {
  labels: [/本人の希望/],
  stops: COMMON_STOPS,
};
const FAMILY_HOPE: FieldSpec = {
  labels: [/家族の希望/],
  stops: COMMON_STOPS,
};
const ISSUES: FieldSpec = {
  labels: [/解決すべき課題(?:・(?:ニーズ|課題))?/, /生活上の課題/, /課題・ニーズ/],
  stops: COMMON_STOPS,
};
const ASSISTANCE_GOAL: FieldSpec = {
  labels: [/援助目標/],
  stops: COMMON_STOPS,
};
const LONG_TERM_GOAL: FieldSpec = {
  labels: [/長期目標/],
  stops: COMMON_STOPS,
};
const SHORT_TERM_GOAL: FieldSpec = {
  labels: [/短期目標/],
  stops: COMMON_STOPS,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function documentDate(row: CsDocRow): string {
  return text(row.applicable_date) || text(row.doc_date_raw).slice(0, 10) || row.created_at.slice(0, 10);
}

function compactLine(value: string): string {
  return value.normalize("NFKC").replace(/[\s　]+/g, "").replace(/^[:：]+/, "");
}

function extractField(source: string, spec: FieldSpec): string {
  const lines = source.replace(/\r/g, "").split("\n");
  const startIndex = lines.findIndex((line) => spec.labels.some((label) => label.test(line)));
  if (startIndex < 0) return "";

  const startLine = lines[startIndex];
  const matchedLabel = spec.labels.find((label) => label.test(startLine));
  if (!matchedLabel) return "";
  const firstMatch = startLine.match(matchedLabel);
  const values: string[] = [];
  const firstValue = firstMatch?.index === undefined
    ? ""
    : startLine.slice(firstMatch.index + firstMatch[0].length);
  if (firstValue.trim()) values.push(compactLine(firstValue));

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (spec.stops.some((stop) => stop.test(line))) break;
    const value = compactLine(line);
    if (value) values.push(value);
    if (values.join("").length >= 1_500) break;
  }

  return values.join("").replace(/[|｜]+$/g, "").trim();
}

export function extractMonitoringSignedPlanFields(source: string) {
  const sourceText = text(source);
  const combinedHope = extractField(sourceText, PERSON_FAMILY_HOPE);
  const personHope = extractField(sourceText, PERSON_HOPE);
  const familyHope = extractField(sourceText, FAMILY_HOPE);
  const assistanceGoal = extractField(sourceText, ASSISTANCE_GOAL)
    || extractField(sourceText, LONG_TERM_GOAL)
    || extractField(sourceText, SHORT_TERM_GOAL);
  return {
    client_request: combinedHope || personHope,
    family_request: combinedHope ? "" : familyHope,
    issues: extractField(sourceText, ISSUES),
    assistance_goal: cleanMonitoringGoalText(assistanceGoal),
  };
}

function toSignedPlan(row: CsDocRow): MonitoringSignedPlan {
  const sourceText = text(row.ocr_text);
  const fields = extractMonitoringSignedPlanFields(sourceText);
  return {
    cs_doc_id: row.id,
    doc_name: text(row.doc_name) || "署名済みプラン",
    document_date: documentDate(row),
    ...fields,
    ocr_ready: Boolean(sourceText),
    summary_ready: Boolean(text(row.summary)),
  };
}

async function findSignedPlan(params: {
  kaipokeCsId: string;
  periodEnd: string;
}): Promise<CsDocRow | null> {
  const { data, error } = await supabaseAdmin
    .from("cs_docs")
    .select("id,doc_name,applicable_date,doc_date_raw,created_at,ocr_text,summary")
    .eq("kaipoke_cs_id", params.kaipokeCsId)
    .order("applicable_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const candidates = ((data ?? []) as CsDocRow[]).filter((row) => isMonitoringSignedPlanName(row.doc_name));
  const dated = candidates.filter((row) => documentDate(row) <= params.periodEnd);
  return dated[0] ?? candidates[0] ?? null;
}

export async function loadMonitoringSignedPlan(params: {
  kaipokeCsId: string;
  periodEnd: string;
}): Promise<MonitoringSignedPlan | null> {
  const row = await findSignedPlan(params);
  return row ? toSignedPlan(row) : null;
}

export async function prepareMonitoringSignedPlan(params: {
  kaipokeCsId: string;
  periodEnd: string;
  accessToken: string;
}): Promise<MonitoringSignedPlan | null> {
  const row = await findSignedPlan(params);
  if (!row) return null;

  let ocrText = text(row.ocr_text);
  if (!ocrText) {
    ocrText = await rerunCsDocOcr(row.id, params.accessToken);
  }

  let summary = text(row.summary);
  if (!summary) {
    summary = await rerunCsDocSummary(row.id, ocrText);
  }

  return toSignedPlan({ ...row, ocr_text: ocrText, summary });
}
