import "server-only";

import OpenAI from "openai";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import type {
  MonitoringAchievement,
  MonitoringContext,
  MonitoringServiceType,
} from "@/types/monitoring";
import {
  isMonitoringAchievement,
  sanitizeEvidenceIds,
} from "./core";
import { buildStructuredAiInput } from "./context";

export type GeneratedMonitoringGoal = {
  goal_id: string;
  achievement: MonitoringAchievement;
  evaluation: string;
  evidence_record_ids: string[];
  review_required: boolean;
  review_content: string;
};

export type GeneratedMonitoring = {
  client_request: string;
  family_request: string;
  issues: string;
  summary: string;
  notable_observations: string[];
  goals: GeneratedMonitoringGoal[];
  model: string;
};

const BASE_SYSTEM_PROMPT = `あなたは訪問介護・障害福祉サービス事業所の
サービス提供責任者を補助するモニタリング作成AIです。

あなたの役割は、利用者のプラン上の目標と、対象期間中に実際に記録された
訪問記録を比較し、サービス提供責任者がケアマネジャー・相談支援専門員等へ
報告するためのモニタリング案を作成することです。

医師、看護師、ケアマネジャー、相談支援専門員等の専門的判断を代替してはいけません。
計画変更、診断、治療方針等を断定しないでください。
必要な場合は、判断そのものではなく、訪問介護現場で観察された具体的事実を記述してください。

入力データに存在しない事実を生成してはいけません。
「順調」「安定」「改善」「悪化」等は、対象期間の記録と過去記録に具体的根拠がある場合だけ使用してください。
十分な記録がなければ、achievementをinsufficient_evidenceとし、
「対象期間の訪問記録からは判断できる情報が限定されています」と明記してください。

目標評価は、目標、対象期間の訪問記録、利用者状況の具体的根拠から判断してください。
evidence_record_idsには、入力visit_recordsに存在するevidence_idだけを入れてください。
前回文章をコピーせず、今回の新しい訪問記録を中心に再評価してください。
文章は簡潔で、連携先専門職が現在の状態を把握しやすいものにしてください。
同じ言葉や定型表現を繰り返さないでください。

事業所の人員・体制・一般的なお知らせを推測または生成してはいけません。
「事業所より」の欄は別途人が管理するため、レスポンスに含めないでください。`;

const CARE_PROMPT = `介護保険型として作成してください。
長期目標・短期目標をそれぞれ評価し、本人希望、家族希望、解決すべき課題、
達成状況、特記事項、今後の方針・計画見直しの必要性を整理してください。
見直しはサービス提供責任者として情報共有が必要かを示すに留め、ケアプラン変更を指示しないでください。`;

const DISABILITY_PROMPT = `障害福祉等の簡易モニタリング型として作成してください。
援助目標と実際の支援状況を対応付け、相談支援専門員が経過を把握できる簡潔な文章にしてください。
個別支援計画の変更や専門判断を断定しないでください。`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "client_request",
    "family_request",
    "issues",
    "summary",
    "notable_observations",
    "goals",
  ],
  properties: {
    client_request: { type: "string" },
    family_request: { type: "string" },
    issues: { type: "string" },
    summary: { type: "string" },
    notable_observations: { type: "array", items: { type: "string" } },
    goals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "goal_id",
          "achievement",
          "evaluation",
          "evidence_record_ids",
          "review_required",
          "review_content",
        ],
        properties: {
          goal_id: { type: "string" },
          achievement: {
            type: "string",
            enum: ["achieved", "partial", "not_achieved", "insufficient_evidence"],
          },
          evaluation: { type: "string" },
          evidence_record_ids: { type: "array", items: { type: "string" } },
          review_required: { type: "boolean" },
          review_content: { type: "string" },
        },
      },
    },
  },
} as const;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function generateMonitoringWithAi(params: {
  context: MonitoringContext;
  serviceType: MonitoringServiceType;
}): Promise<GeneratedMonitoring> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY が設定されていません");

  const profile = OPENAI_PROFILES.critical;
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: profile.model,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "client_monitoring",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
    messages: [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}\n\n${
          params.serviceType === "care_insurance" ? CARE_PROMPT : DISABILITY_PROMPT
        }`,
      },
      {
        role: "user",
        content: JSON.stringify(buildStructuredAiInput(params.context, params.serviceType)),
      },
    ],
  });

  const rawText = response.choices[0]?.message?.content?.trim();
  if (!rawText) throw new Error("OpenAIからモニタリング案が返されませんでした");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("OpenAIの応答をJSONとして読み取れませんでした");
  }

  const root = record(parsed);
  const allowedEvidenceIds = new Set(
    params.context.visit_records.map((visit) => visit.evidence_id),
  );
  const allowedGoalIds = new Set(params.context.goals.map((goal) => goal.goal_id));
  const generatedByGoal = new Map<string, GeneratedMonitoringGoal>();

  for (const candidate of Array.isArray(root.goals) ? root.goals : []) {
    const goal = record(candidate);
    const goalId = stringValue(goal.goal_id);
    if (!allowedGoalIds.has(goalId)) continue;
    const achievement = isMonitoringAchievement(goal.achievement)
      ? goal.achievement
      : "insufficient_evidence";
    generatedByGoal.set(goalId, {
      goal_id: goalId,
      achievement,
      evaluation:
        stringValue(goal.evaluation) ||
        "対象期間の訪問記録からは判断できる情報が限定されています。",
      evidence_record_ids: sanitizeEvidenceIds(
        goal.evidence_record_ids,
        allowedEvidenceIds,
      ),
      review_required: goal.review_required === true,
      review_content: stringValue(goal.review_content),
    });
  }

  const goals = params.context.goals.map(
    (sourceGoal): GeneratedMonitoringGoal =>
      generatedByGoal.get(sourceGoal.goal_id) ?? {
        goal_id: sourceGoal.goal_id,
        achievement: "insufficient_evidence",
        evaluation: "対象期間の訪問記録からは判断できる情報が限定されています。",
        evidence_record_ids: [],
        review_required: false,
        review_content: "",
      },
  );

  return {
    client_request: stringValue(root.client_request),
    family_request: stringValue(root.family_request),
    issues: stringValue(root.issues),
    summary: stringValue(root.summary),
    notable_observations: (Array.isArray(root.notable_observations)
      ? root.notable_observations
      : []
    )
      .map(stringValue)
      .filter(Boolean),
    goals,
    model: response.model || profile.model,
  };
}
