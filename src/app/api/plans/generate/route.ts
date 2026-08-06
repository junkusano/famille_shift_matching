// src/app/api/plans/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

type GenerateBody = {
  assessment_id?: string;
  replace_existing?: boolean;

  /*
   * 介護保険プランの基準にする
   * cs_docs.id
   */
  base_care_plan_cs_doc_id?: string;
};

type PlanDocumentKind =
  | "障害福祉サービス"
  | "移動支援サービス"
  | "訪問介護サービス"
  | "訪問介護予防サービス"
  | "役務提供請負サービス"
  | "重度障がい者等就労支援サービス";

type AssessmentRow = {
  assessment_id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  service_kind: string;
  assessed_on: string;
  author_user_id: string;
  author_name: string;
  content: Record<string, unknown>;
  is_deleted: boolean;
  meeting_minutes: string | null;
};

type SourceRow = {
  template_id: number | null;
  kaipoke_cs_id: string | null;
  weekday: number | null;
  weekday_jp: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number | null;
  service_code: string | null;
  required_staff_count: number | null;
  two_person_work_flg: boolean | null;
  active: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  is_biweekly: boolean | null;
  nth_weeks: number[] | null;
  invalid_time: boolean | null;
  overlaps_same_weekday: boolean | null;
  shift_service_code_id: string | null;
  kaipoke_servicek: string | null;
  kaipoke_servicecode: string | null;
  plan_document_kind: PlanDocumentKind | null;
  plan_service_category: string | null;
  plan_display_name: string | null;
};

type CsDocRow = {
  id: string;
  doc_name: string | null;
  summary: string | null;
  ocr_text: string | null;
  applicable_date: string | null;
  doc_date_raw: string | null;
  created_at: string | null;
};

type CarePlanCandidateRow = {
  id: string;
  doc_name: string | null;
  summary: string | null;
  applicable_date: string | null;
  doc_date_raw: string | null;
  created_at: string;
};
type VisitNoteRow = {
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  tokutei_comment: string | null;
  service_code: string | null;
};

type ServiceTextDraft = {
  service_detail: string;
  procedure_notes: string;
  family_action: string;
};

type CarePlanGoalDraft = {
  long_term_goal: string;

  /*
   * ケアプラン原文に記載された
   * 長期目標の期間。
   *
   * 日付が読み取れない場合は null。
   */
  long_term_goal_start_date:
  string | null;

  long_term_goal_end_date:
  string | null;

  short_term_goal: string;

  /*
   * ケアプラン原文に記載された
   * 短期目標の期間。
   *
   * 日付が読み取れない場合は null。
   */
  short_term_goal_start_date:
  string | null;

  short_term_goal_end_date:
  string | null;

  source_text: string;
};

type ServiceGoalRelationDraft = {
  service_no: number;
  short_term_goal_index: number;
  relation_note: string;
};

type PlanHeaderDraft = {
  person_family_hope: string;
  assistance_goal: string;
  care_plan_goals: CarePlanGoalDraft[];
};

type PlanSourceTextResult = {
  text: string;
  hasUsableSource: boolean;
  sourceLabels: string[];
};

const TITLE_MAP: Record<PlanDocumentKind, string> = {
  障害福祉サービス:
    "障害福祉サービス　ファミーユヘルパーサービス愛知　個別計画書",

  移動支援サービス:
    "移動支援サービス　ファミーユヘルパーサービス愛知　個別計画書",

  /*
   * 介護保険
   * 要介護者用
   */
  訪問介護サービス:
    "訪問介護計画書",

  /*
   * 介護保険
   * 要支援者用
   */
  訪問介護予防サービス:
    "介護予防訪問介護計画書",

  役務提供請負サービス:
    "役務提供請負サービス　ファミーユヘルパーサービス愛知　個別計画書",

  重度障がい者等就労支援サービス:
    "重度障がい者等就労支援サービス　ファミーユヘルパーサービス愛知　個別計画書",
};

function calcFactor(row: SourceRow) {
  if (row.is_biweekly) return 2.5;
  if (row.nth_weeks?.length) return row.nth_weeks.length;
  return 5;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function calcMonthlySummary(rows: SourceRow[]) {
  const map = new Map<
    string,
    { category: string; monthly_minutes: number; monthly_hours: number; occurrence_factor: number }
  >();

  for (const row of rows) {
    const category = row.plan_service_category ?? "未分類";
    const duration = row.duration_minutes ?? 0;
    const factor = calcFactor(row);
    const monthlyMinutes = duration * factor;

    const hit = map.get(category);
    if (hit) {
      hit.monthly_minutes += monthlyMinutes;
      hit.monthly_hours = round2(hit.monthly_minutes / 60);
      hit.occurrence_factor += factor;
    } else {
      map.set(category, {
        category,
        monthly_minutes: monthlyMinutes,
        monthly_hours: round2(monthlyMinutes / 60),
        occurrence_factor: factor,
      });
    }
  }

  return [...map.values()];
}

function extractAssessmentTexts(content: Record<string, unknown>) {
  const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
  const hopes: string[] = [];
  const remarks: string[] = [];

  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") continue;
    const rows = Array.isArray((sheet as { rows?: unknown }).rows)
      ? ((sheet as { rows?: unknown[] }).rows ?? [])
      : [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;

      const hope =
        typeof (row as { hope?: unknown }).hope === "string"
          ? ((row as { hope?: string }).hope ?? "").trim()
          : "";

      const remark =
        typeof (row as { remark?: unknown }).remark === "string"
          ? ((row as { remark?: string }).remark ?? "").trim()
          : "";

      if (hope) hopes.push(hope);
      if (remark) remarks.push(remark);
    }
  }

  return {
    person_family_hope: hopes.length ? [...new Set(hopes)].join(" / ") : null,
    assistance_goal: remarks.length ? [...new Set(remarks)].slice(0, 8).join(" / ") : null,
  };
}

function buildWarnings(rows: SourceRow[]) {
  const warnings: string[] = [];
  if (rows.some((r) => r.invalid_time)) warnings.push("時間不整合の可能性がある週間シフトを含みます。");
  if (rows.some((r) => r.overlaps_same_weekday)) warnings.push("同曜日重複の可能性がある週間シフトを含みます。");
  if (rows.some((r) => r.is_biweekly)) warnings.push("隔週シフトを含みます。月間総量は概算です。");
  if (rows.some((r) => (r.nth_weeks?.length ?? 0) > 0)) warnings.push("nth_weeks を含みます。帳票化前に確認してください。");
  if (rows.some((r) => r.two_person_work_flg)) warnings.push("2名同時作業を含みます。帳票明記を確認してください。");
  return warnings;
}

async function buildPlanSourceText(
  a: AssessmentRow,
  selectedCarePlan: CsDocRow | null = null,
): Promise<PlanSourceTextResult> {
  const { data: docs, error } = await supabaseAdmin
    .from("cs_docs")
    .select("doc_name, summary, ocr_text, created_at")
    .eq("kaipoke_cs_id", a.kaipoke_cs_id)
    .in("doc_name", [
      "基本情報(ステップ２）",
      "基本情報",
      "サービス等利用計画",
      "障害福祉サービス等利用計画",
      "サービス等利用計画案",
      "情報連携・看護サマリー等",
      "サ担会要点・議事録",
      "ケアプラン(居宅介護支援計画書）",
    ])
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[plans/generate] cs_docs fetch failed", error.message);
  }

  const sourceLabels: string[] = [];

  const selectedCarePlanText =
    selectedCarePlan
      ? [
        "【今回選択された基準ケアプラン】",

        `文書ID: ${selectedCarePlan.id}`,

        selectedCarePlan.doc_name
          ? `文書名: ${selectedCarePlan.doc_name}`
          : "",

        selectedCarePlan.applicable_date
          ? `適用日: ${selectedCarePlan.applicable_date}`
          : "",

        selectedCarePlan.doc_date_raw
          ? `文書日付: ${selectedCarePlan.doc_date_raw}`
          : "",

        "【ケアプランサマリー】",
        selectedCarePlan.summary ?? "",

        "【ケアプランOCR本文】",
        selectedCarePlan.ocr_text ?? "",
      ]
        .filter(
          (value) =>
            typeof value === "string" &&
            value.trim() !== "",
        )
        .join("\n")
      : "";

  if (selectedCarePlan) {
    sourceLabels.push(
      `基準ケアプラン:${selectedCarePlan.id}`,
    );
  }

  const docText = ((docs ?? []) as CsDocRow[])
    .map((d) => {
      const docName = d.doc_name ?? "資料";

      const isCoreDoc =
        docName.includes("基本情報") ||
        docName.includes("サービス等利用計画") ||
        docName.includes("利用計画");

      if (isCoreDoc) {
        sourceLabels.push(docName);
      }

      const text = [
        d.summary ?? "",
        d.ocr_text ? d.ocr_text.slice(0, 2500) : "",
      ]
        .filter(Boolean)
        .join("\n");

      return text ? `【${docName}】\n${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const meetingMinutes = a.meeting_minutes?.trim()
    ? `【担当者会議議事録】\n${a.meeting_minutes.trim()}`
    : "";

  if (meetingMinutes) {
    sourceLabels.push("担当者会議議事録");
  }

  const assessmentText = flattenAssessmentContent(a.content ?? {});

  const visitNotesText = await buildVisitNotesText(a);

  if (visitNotesText) {
    sourceLabels.push("直近の訪問介護記録・特定コメント");
  }

  const text = [
    /*
     * 選択されたケアプランを最優先資料として
     * 必ず先頭に置く。
     */
    selectedCarePlanText,

    meetingMinutes,
    docText,
    assessmentText,
    visitNotesText,
  ]
    .filter(
      (value) =>
        typeof value === "string" &&
        value.trim() !== "",
    )
    .join("\n\n")
    .slice(0, 18000);

  const hasUsableSource = sourceLabels.some((x) =>
    x.includes("基本情報") ||
    x.includes("サービス等利用計画") ||
    x.includes("利用計画") ||
    x.includes("担当者会議議事録")
  );

  return {
    text,
    hasUsableSource,
    sourceLabels: [...new Set(sourceLabels)],
  };
}

function flattenAssessmentContent(content: Record<string, unknown>): string {
  const sheets = Array.isArray(content.sheets) ? content.sheets : [];
  const lines: string[] = [];

  for (const sheet of sheets) {
    if (!sheet || typeof sheet !== "object") continue;
    const s = sheet as { title?: unknown; rows?: unknown };
    const title = typeof s.title === "string" ? s.title : "";

    if (title) lines.push(`【${title}】`);

    const rows = Array.isArray(s.rows) ? s.rows : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as {
        label?: unknown;
        check?: unknown;
        remark?: unknown;
        hope?: unknown;
      };

      const label = typeof r.label === "string" ? r.label : "";
      const check = r.check === "CIRCLE" ? "○" : "";
      const remark = typeof r.remark === "string" ? r.remark.trim() : "";
      const hope = typeof r.hope === "string" ? r.hope.trim() : "";

      if (check || remark || hope) {
        lines.push(
          [
            label ? `・${label}` : "",
            check ? `チェック:${check}` : "",
            remark ? `備考:${remark}` : "",
            hope ? `希望:${hope}` : "",
          ]
            .filter(Boolean)
            .join(" / "),
        );
      }
    }
  }

  return lines.length ? `【アセスメント】\n${lines.join("\n")}` : "";
}

async function buildPlanHeaderDraft(params: {
  sourceText: string;
  extracted: {
    person_family_hope: string | null;
    assistance_goal: string | null;
  };
}): Promise<PlanHeaderDraft> {
  const fallback = buildPlanHeaderFallback(params.extracted);

  if (!process.env.OPENAI_API_KEY || !params.sourceText.trim()) {
    return fallback;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
あなたは障害福祉サービス・訪問介護の計画書作成を補助する専門職です。

以下の資料から、計画書に記載する次の内容を作成してください。

1. 本人（家族）の希望
2. 援助目標
3. 選択された居宅介護支援計画書に記載された長期目標・短期目標

重要ルール:
- JSONのみ返してください。
- 資料に書かれている事実・意向・会議内容だけを使ってください。
- 推測、創作、一般論による補完は禁止です。
- 利用者本人の氏名、家族氏名、職員名は本文に入れないでください。
- person_family_hope は150文字程度。ただし資料から読み取れなければ空文字にしてください。
- assistance_goal は150文字程度。
- 援助目標は「困難である」「できない」などの課題説明ではなく、支援によって目指す状態を書いてください。
- ただし、資料に根拠がない目標を創作しないでください。
- 資料から目標が十分に読み取れない場合は、空文字にしてください。
- 医療判断、診断、過度な断定は禁止です。

【介護保険の長期目標・短期目標】

資料内に
「今回選択された基準ケアプラン」
がある場合は、そのケアプランに記載された長期目標・短期目標を抽出してください。

目標文は、原則としてケアプランの原文をそのまま使用してください。

言い換え、要約、創作は行わないでください。

長期目標と短期目標は、対応する組み合わせとして返してください。

長期目標・短期目標のそれぞれについて、
ケアプランに記載された開始日と終了日も抽出してください。

日付は必ず西暦の YYYY-MM-DD 形式で返してください。

和暦で記載されている場合は、
次の対応に従って西暦へ変換してください。

- 令和元年 = 2019年
- 令和2年 = 2020年
- 令和3年 = 2021年
- 令和4年 = 2022年
- 令和5年 = 2023年
- 令和6年 = 2024年
- 令和7年 = 2025年
- 令和8年 = 2026年
- 令和9年 = 2027年
- 令和10年 = 2028年

重要:
- 日付はケアプラン原文と完全に一致させてください。
- 日付を推測・補完・延長しないでください。
- 長期目標と短期目標で期間が異なる場合は、それぞれ別に抽出してください。
- 開始日だけ記載されている場合、終了日は null にしてください。
- 終了日だけ記載されている場合、開始日は null にしてください。
- 日付が記載されていない場合は null にしてください。
- ケアプランの作成日、認定期間、サービス開始日を目標期間として代用してはいけません。

訪問介護と明らかに無関係な目標は除外して構いません。

除外してよい例:

- 福祉用具貸与だけに関する目標
- 住宅改修だけに関する目標
- 訪問介護が一切関与しない医療機関だけの目標
- 訪問介護が一切関与しない専門職だけの目標

ただし、除外は慎重に行ってください。

例えば次の目標は、訪問介護と関係する可能性があります。

- デイサービスへ継続して通う
- 安全に通所する
- 外出の機会を維持する
- 自宅で安定した生活を続ける
- 安全に入浴する
- 清潔を保つ
- 通院を継続する
- 生活リズムを整える
- 安全に外出する
- 在宅生活を継続する

デイサービス前後に訪問介護が、

- 外出準備
- 更衣
- 持ち物確認
- 送り出し
- 迎え入れ
- 帰宅後の受け入れ
- 体調確認

などを行う場合は、
デイサービスに関する目標も訪問介護の目標として採用してください。

ケアプラン内に訪問介護と関係する目標がある場合は、
必ず1組以上の長期目標・短期目標を返してください。

最大3組まで返してください。

訪問介護との関係が判断できない場合でも、
関係する可能性がある目標は安易に除外しないでください。

source_textには、
その目標を採用した根拠となるケアプラン原文を記載してください。

悪い例:
{
  "assistance_goal": "掃除が困難である。"
}

良い例:
{
  "assistance_goal": "必要な支援を受けながら住環境を整え、安心して在宅生活を継続できるようにする。"
}

返却形式:
{
  "person_family_hope": "",
  "assistance_goal": "",
  "care_plan_goals": [
    {
      "long_term_goal": "",
      "long_term_goal_start_date": "2026-07-01",
      "long_term_goal_end_date": "2026-10-31",
      "short_term_goal": "",
      "short_term_goal_start_date": "2026-07-01",
      "short_term_goal_end_date": "2026-10-31",
      "source_text": ""
    }
  ]
}

日付が記載されていない場合の例:
{
  "long_term_goal_start_date": null,
  "long_term_goal_end_date": null,
  "short_term_goal_start_date": null,
  "short_term_goal_end_date": null
}

資料:
${params.sourceText}
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "返答はJSONのみ。説明文やMarkdownは禁止。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);

    if (!parsed || typeof parsed !== "object") return fallback;

    const obj =
      parsed as Record<string, unknown>;

    const rawGoals =
      Array.isArray(obj.care_plan_goals)
        ? obj.care_plan_goals
        : [];

    const carePlanGoals =
      rawGoals
        .map((item) => {
          if (
            !item ||
            typeof item !== "object"
          ) {
            return null;
          }

          const goal =
            item as Record<
              string,
              unknown
            >;

          const longTermGoal =
            typeof goal.long_term_goal ===
              "string"
              ? goal.long_term_goal.trim()
              : "";

          const shortTermGoal =
            typeof goal.short_term_goal ===
              "string"
              ? goal.short_term_goal.trim()
              : "";

          const sourceText =
            typeof goal.source_text ===
              "string"
              ? goal.source_text.trim()
              : "";

          const longTermGoalStartDate =
            normalizeIsoDate(
              goal.long_term_goal_start_date,
            );

          const longTermGoalEndDate =
            normalizeIsoDate(
              goal.long_term_goal_end_date,
            );

          const shortTermGoalStartDate =
            normalizeIsoDate(
              goal.short_term_goal_start_date,
            );

          const shortTermGoalEndDate =
            normalizeIsoDate(
              goal.short_term_goal_end_date,
            );

          /*
           * 長期・短期の両方が揃ったものだけ採用する。
           *
           * 日付は記載がない場合もあるため、
           * nullでも目標自体は採用する。
           */
          if (
            !longTermGoal ||
            !shortTermGoal
          ) {
            return null;
          }

          return {
            long_term_goal:
              limitJapaneseText(
                longTermGoal,
                300,
              ),

            long_term_goal_start_date:
              longTermGoalStartDate,

            long_term_goal_end_date:
              longTermGoalEndDate,

            short_term_goal:
              limitJapaneseText(
                shortTermGoal,
                300,
              ),

            short_term_goal_start_date:
              shortTermGoalStartDate,

            short_term_goal_end_date:
              shortTermGoalEndDate,

            source_text:
              limitJapaneseText(
                sourceText,
                600,
              ),
          };
        })
        .filter(
          (
            item,
          ): item is CarePlanGoalDraft =>
            item !== null,
        )
        .slice(0, 3);

    return {
      person_family_hope:
        limitJapaneseText(
          typeof obj.person_family_hope ===
            "string"
            ? obj.person_family_hope
            : fallback.person_family_hope,
          170,
        ),

      assistance_goal:
        normalizeGoalText(
          limitJapaneseText(
            typeof obj.assistance_goal ===
              "string"
              ? obj.assistance_goal
              : fallback.assistance_goal,
            170,
          ),
        ),

      care_plan_goals:
        carePlanGoals,
    };
  } catch (e) {
    console.warn("[plans/generate] header draft LLM failed", e);
    return fallback;
  }
}

function buildPlanHeaderFallback(extracted: {
  person_family_hope: string | null;
  assistance_goal: string | null;
}): PlanHeaderDraft {
  return {
    person_family_hope: removePersonNames(
      limitJapaneseText(
        extracted.person_family_hope?.trim() ?? "",
        170,
      ),
    ),

    assistance_goal: normalizeGoalText(
      removePersonNames(
        limitJapaneseText(
          extracted.assistance_goal?.trim() ?? "",
          170,
        ),
      ),
    ),

    /*
     * ケアプラン目標はAI抽出結果だけを採用する。
     * フォールバックで創作しない。
     */
    care_plan_goals: [],
  };
}

function normalizeGoalText(text: string): string {
  const t = text.trim();

  const badPatterns = [
    "困難とされている",
    "難しいとされている",
    "できない",
    "困難である",
  ];

  if (!badPatterns.some((p) => t.includes(p))) {
    return t;
  }

  return "本人の生活状況に応じて必要な支援を行い、住環境を整えながら、安心して在宅生活を継続できるようにする。";
}

function limitJapaneseText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function normalizeIsoDate(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed =
    value.trim();

  if (!trimmed) {
    return null;
  }

  /*
   * AIの返却値は必ず
   * YYYY-MM-DD とする。
   */
  const match =
    trimmed.match(
      /^(\d{4})-(\d{2})-(\d{2})$/,
    );

  if (!match) {
    return null;
  }

  const year =
    Number(match[1]);

  const month =
    Number(match[2]);

  const day =
    Number(match[3]);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  /*
   * 2026-02-31のような不正日付を
   * 通さない。
   */
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !==
    month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmed;
}


async function buildServiceDraftsByCategory(params: {
  sourceText: string;
  assessmentContent: Record<string, unknown>;
  targetRows: SourceRow[];
}): Promise<Record<string, ServiceTextDraft>> {
  const { sourceText, targetRows } = params;

  const keys = [...new Set(targetRows.map(buildServiceDraftKey))];

  const fallback: Record<string, ServiceTextDraft> = {};
  for (const row of targetRows) {
    const key = buildServiceDraftKey(row);
    fallback[key] = fallbackServiceDraft();
  }

  if (!process.env.OPENAI_API_KEY || !sourceText.trim()) {
    return fallback;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
あなたは訪問介護・障害福祉サービスの個別計画書作成を補助する専門職です。
以下の資料から、サービス種別ごとに「サービスの内容」「手順・留意事項・観察ポイント」「本人・家族にやっていただくこと」を作成してください。

重要ルール:
- JSONのみ返してください。
- キーは指定された service_keys のみ使ってください。
- 各キーに service_detail, procedure_notes, family_action を入れてください。
- 資料に書かれている事実・意向・会議内容だけを使ってください。
- 推測、創作、一般論による補完は禁止です。
- 利用者本人の氏名、家族氏名、職員名は本文に入れないでください。
- service_detail は50〜100文字程度。
- procedure_notes は50〜100文字程度。
- family_action は50〜100文字程度。
- service_detail は、資料から読み取れるサービス内容がある場合のみ入れてください。読み取れなければ空文字。
- procedure_notes は、資料から読み取れる手順・留意事項・観察ポイントがある場合のみ入れてください。読み取れなければ空文字。
- family_action は、資料から本人または家族に依頼・協力してもらう内容が読み取れる場合のみ入れてください。読み取れなければ空文字。
- 家事系には、資料から読み取れる掃除、洗濯、調理、買い物、整理整頓などだけを入れてください。
- 身体系には家事だけを入れてはいけません。
- 「直近の訪問介護記録・特定コメント」は、実際の支援内容・手順・注意点の重要な根拠として扱ってください。
- 訪問記録に具体的な掃除、調理、買い物、服薬確認、声かけ、見守り、移動、通院、手順、注意点があれば、それを優先して service_detail / procedure_notes に反映してください。
- ただし、訪問記録にない内容を補って書かないでください。
- 身体系で家事的内容しか資料から読み取れない場合は「掃除（共に行う）」「整理整頓（声かけ・見守りのもと共に行う）」のように、共同実践・声かけ・見守りと分かる表現にしてください。
- 空欄を避けるための一般文補完は禁止です。
- 医療判断、診断、過度な断定は禁止です。

service_keys:
${keys.map((k) => `- ${k}`).join("\n")}

返却形式:
{
  "家事": {
    "service_detail": "",
    "procedure_notes": "",
    "family_action": ""
  },
  "身体": {
    "service_detail": "",
    "procedure_notes": "",
    "family_action": ""
  }
}

資料:
${sourceText}
`;

    const resp = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "返答はJSONのみ。説明文やMarkdownは禁止。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = resp.choices[0]?.message?.content ?? "";
    const parsed = safeJsonParse(raw);

    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }

    const result: Record<string, ServiceTextDraft> = { ...fallback };

    for (const key of keys) {
      const v = (parsed as Record<string, unknown>)[key];
      if (!v || typeof v !== "object") continue;

      const obj = v as Record<string, unknown>;

      const merged = {
        service_detail: limitJapaneseText(
          typeof obj.service_detail === "string" ? obj.service_detail.trim() : "",
          100,
        ),
        procedure_notes: limitJapaneseText(
          typeof obj.procedure_notes === "string" ? obj.procedure_notes.trim() : "",
          100,
        ),
        family_action: limitJapaneseText(
          typeof obj.family_action === "string" ? obj.family_action.trim() : "",
          100,
        ),
      };

      result[key] = enforceServiceBoundary(key, merged);
    }

    return result;
  } catch (e) {
    console.warn("[plans/generate] service draft LLM failed", e);
    return fallback;
  }
}

async function buildServiceGoalRelations(params: {
  sourceText: string;
  planServices: Array<{
    service_no: number;
    plan_service_category: string | null;
    service_title: string | null;
    service_code: string | null;
    service_detail: string | null;
    procedure_notes: string | null;
  }>;
  carePlanGoals: CarePlanGoalDraft[];
}): Promise<ServiceGoalRelationDraft[]> {
  const {
    sourceText,
    planServices,
    carePlanGoals,
  } = params;

  if (
    planServices.length === 0 ||
    carePlanGoals.length === 0
  ) {
    return [];
  }

  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  const serviceList =
    planServices.map((service) => ({
      service_no:
        service.service_no,

      plan_service_category:
        service.plan_service_category,

      service_title:
        service.service_title,

      service_code:
        service.service_code,

      service_detail:
        service.service_detail,

      procedure_notes:
        service.procedure_notes,
    }));

  const goalList =
    carePlanGoals.map(
      (goal, index) => ({
        short_term_goal_index:
          index,

        long_term_goal:
          goal.long_term_goal,

        short_term_goal:
          goal.short_term_goal,
      }),
    );

  try {
    const openai =
      new OpenAI({
        apiKey:
          process.env.OPENAI_API_KEY,
      });

    const prompt = `
あなたは訪問介護計画書の作成を補助する専門職です。

以下の訪問介護サービスと、
ケアプランから抽出された短期目標の関連性を判定してください。

重要ルール:
- JSONのみ返してください。
- 関連性がある組み合わせだけを返してください。
- 全サービスを全目標へ機械的に紐づけてはいけません。
- 資料、サービス内容、短期目標の文脈から判断してください。
- 関連性が弱い場合は紐づけないでください。
- 一つのサービスが複数の短期目標に関係する場合は、複数返して構いません。
- 一つの短期目標に複数のサービスが関係する場合も、複数返して構いません。
- relation_noteには、なぜそのサービスが短期目標に関係するのかを簡潔に記載してください。
- service_noは指定された値をそのまま使ってください。
- short_term_goal_indexは指定された0始まりの番号をそのまま使ってください。
- 指定にないservice_noやshort_term_goal_indexを作らないでください。

特に次のような関係を考慮してください。

- デイサービスへ通う目標
  → 外出準備、送り出し、迎え入れ、帰宅後の受け入れ、体調確認

- 安全に入浴する目標
  → 入浴介助、脱衣、更衣、洗身、見守り、体調確認

- 清潔を保つ目標
  → 入浴、清拭、更衣、洗濯、掃除

- 在宅生活を継続する目標
  → 掃除、洗濯、調理、買い物、服薬確認、排泄、入浴、見守り

- 通院を継続する目標
  → 外出準備、通院介助、乗降介助、移動介助、服薬確認

返却形式:
{
  "relations": [
    {
      "service_no": 1,
      "short_term_goal_index": 0,
      "relation_note": ""
    }
  ]
}

【訪問介護サービス】
${JSON.stringify(serviceList, null, 2)}

【ケアプラン目標】
${JSON.stringify(goalList, null, 2)}

【資料】
${sourceText}
`;

    const resp =
      await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "返答はJSONのみ。説明文やMarkdownは禁止。",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    const raw =
      resp.choices[0]
        ?.message?.content ?? "";

    const parsed =
      safeJsonParse(raw);

    if (
      !parsed ||
      typeof parsed !== "object"
    ) {
      return [];
    }

    const obj =
      parsed as Record<
        string,
        unknown
      >;

    const rawRelations =
      Array.isArray(obj.relations)
        ? obj.relations
        : [];

    const validServiceNos =
      new Set(
        planServices.map(
          (service) =>
            service.service_no,
        ),
      );

    const validGoalIndexes =
      new Set(
        carePlanGoals.map(
          (_, index) => index,
        ),
      );

    const uniqueKeys =
      new Set<string>();

    const relations =
      rawRelations
        .map((item) => {
          if (
            !item ||
            typeof item !== "object"
          ) {
            return null;
          }

          const relation =
            item as Record<
              string,
              unknown
            >;

          const serviceNo =
            typeof relation.service_no ===
              "number"
              ? relation.service_no
              : Number(
                relation.service_no,
              );

          const shortTermGoalIndex =
            typeof relation
              .short_term_goal_index ===
              "number"
              ? relation
                .short_term_goal_index
              : Number(
                relation
                  .short_term_goal_index,
              );

          const relationNote =
            typeof relation
              .relation_note ===
              "string"
              ? relation
                .relation_note
                .trim()
              : "";

          if (
            !Number.isInteger(
              serviceNo,
            ) ||
            !Number.isInteger(
              shortTermGoalIndex,
            ) ||
            !validServiceNos.has(
              serviceNo,
            ) ||
            !validGoalIndexes.has(
              shortTermGoalIndex,
            )
          ) {
            return null;
          }

          const uniqueKey =
            `${serviceNo}:${shortTermGoalIndex}`;

          if (
            uniqueKeys.has(
              uniqueKey,
            )
          ) {
            return null;
          }

          uniqueKeys.add(
            uniqueKey,
          );

          return {
            service_no:
              serviceNo,

            short_term_goal_index:
              shortTermGoalIndex,

            relation_note:
              limitJapaneseText(
                relationNote,
                300,
              ),
          };
        })
        .filter(
          (
            item,
          ): item is ServiceGoalRelationDraft =>
            item !== null,
        );

    return relations;
  } catch (error) {
    console.warn(
      "[plans/generate] service goal relation LLM failed",
      error,
    );

    return [];
  }
}

function safeJsonParse(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildServiceDraftKey(row: SourceRow): string {
  const category = row.plan_service_category ?? row.plan_display_name ?? row.service_code ?? "未分類";
  return normalizeServiceKey(category);
}

function normalizeServiceKey(v: string): string {
  if (isHouseworkLike(v)) return "家事";
  if (isBodyLike(v)) return "身体";
  if (v.includes("通院")) return "通院";
  if (v.includes("同行")) return "同行援護";
  if (v.includes("移動")) return "移動支援";
  if (v.includes("重度") || v.includes("重訪")) return "重度訪問";
  if (v.includes("行動")) return "行動援護";
  return v;
}

function fallbackServiceDraft(): ServiceTextDraft {
  return {
    service_detail: "",
    procedure_notes: "",
    family_action: "",
  };
}

function enforceServiceBoundary(key: string, draft: ServiceTextDraft): ServiceTextDraft {
  if (key !== "身体") return draft;

  const text = `${draft.service_detail}\n${draft.procedure_notes}`;
  if (!isHouseworkLike(text)) return draft;

  const hasBodyWord =
    text.includes("体調") ||
    text.includes("見守り") ||
    text.includes("声かけ") ||
    text.includes("身体") ||
    text.includes("移乗") ||
    text.includes("排泄") ||
    text.includes("入浴") ||
    text.includes("更衣");

  if (hasBodyWord) return draft;

  return {
    ...draft,
    service_detail:
      "掃除（共に行う）、整理整頓（声かけ・見守りのもと共に行う）等、本人の動作確認や共同実践として必要な支援を行う。",
    procedure_notes:
      "本人の体調、疲労感、ふらつき等を確認しながら、できる動作は声かけ・見守りのもと共に行う。転倒や無理な動作に注意する。",
  };
}

function isHouseworkLike(text: string): boolean {
  return (
    text.includes("家事") ||
    text.includes("掃除") ||
    text.includes("清掃") ||
    text.includes("洗濯") ||
    text.includes("買い物") ||
    text.includes("買物") ||
    text.includes("調理") ||
    text.includes("整理整頓")
  );
}

function isBodyLike(text: string): boolean {
  return (
    text.includes("身体") ||
    text.includes("入浴") ||
    text.includes("排泄") ||
    text.includes("更衣") ||
    text.includes("移乗") ||
    text.includes("体調") ||
    text.includes("見守り")
  );
}

function buildScheduleNote(row: SourceRow) {
  const notes: string[] = [];
  if (row.is_biweekly) notes.push("隔週");
  if (row.nth_weeks?.length) notes.push(`第${row.nth_weeks.join("・")}週`);
  if (row.two_person_work_flg) notes.push("2名同時作業");
  return notes.length ? notes.join(" / ") : null;
}

/**
 * 介護保険プラン生成時に選択する
 * 基準ケアプラン候補を取得する。
 *
 * GET /api/plans/generate?assessment_id=...
 */
export async function GET(
  req: NextRequest,
) {
  try {
    await getUserFromBearer(req);

    const assessmentId =
      req.nextUrl.searchParams
        .get("assessment_id")
        ?.trim() ?? "";

    if (!assessmentId) {
      return json(
        {
          ok: false,
          error:
            "assessment_id is required",
        },
        400,
      );
    }

    const {
      data: assessment,
      error: assessmentError,
    } = await supabaseAdmin
      .from("assessments_records")
      .select(
        `
          assessment_id,
          kaipoke_cs_id,
          service_kind
        `,
      )
      .eq(
        "assessment_id",
        assessmentId,
      )
      .eq(
        "is_deleted",
        false,
      )
      .maybeSingle();

    if (assessmentError) {
      throw assessmentError;
    }

    if (!assessment) {
      return json(
        {
          ok: false,
          error:
            "assessment not found",
        },
        404,
      );
    }

    const isElderCare =
      assessment.service_kind ===
      "要介護" ||
      assessment.service_kind ===
      "要支援";

    /*
     * 障害アセスメントでは、
     * 基準ケアプランの選択は不要。
     */
    if (!isElderCare) {
      return json({
        ok: true,
        service_kind:
          assessment.service_kind,
        requires_base_care_plan: false,
        care_plans: [],
      });
    }

    const {
      data: carePlans,
      error: carePlanError,
    } = await supabaseAdmin
      .from("cs_docs")
      .select(
        `
          id,
          doc_name,
          summary,
          applicable_date,
          doc_date_raw,
          created_at
        `,
      )
      .eq(
        "kaipoke_cs_id",
        assessment.kaipoke_cs_id,
      )
      /*
       * 全角・半角括弧や名称の微妙な違いを
       * 吸収するため、完全一致ではなく
       * 「居宅介護支援計画書」を含む文書を取得。
       */
      .ilike(
        "doc_name",
        "%居宅介護支援計画書%",
      )
      .order(
        "applicable_date",
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .order(
        "created_at",
        {
          ascending: false,
        },
      );

    if (carePlanError) {
      throw carePlanError;
    }

    const candidates =
      (
        (carePlans ?? []) as
        CarePlanCandidateRow[]
      ).map((plan) => ({
        id: plan.id,

        doc_name:
          plan.doc_name ??
          "ケアプラン（居宅介護支援計画書）",

        applicable_date:
          plan.applicable_date,

        doc_date_raw:
          plan.doc_date_raw,

        created_at:
          plan.created_at,

        /*
         * 選択欄で内容を判別できるよう、
         * サマリーの冒頭だけ返す。
         */
        summary_preview:
          plan.summary
            ?.replace(/\s+/g, " ")
            .trim()
            .slice(0, 180) ?? "",
      }));

    console.info(
      "[plans/generate] care plan candidates",
      {
        assessment_id:
          assessmentId,

        kaipoke_cs_id:
          assessment.kaipoke_cs_id,

        service_kind:
          assessment.service_kind,

        candidate_count:
          candidates.length,

        candidate_ids:
          candidates.map(
            (candidate) =>
              candidate.id,
          ),
      },
    );

    return json({
      ok: true,

      assessment_id:
        assessmentId,

      kaipoke_cs_id:
        assessment.kaipoke_cs_id,

      service_kind:
        assessment.service_kind,

      requires_base_care_plan: true,

      care_plans:
        candidates,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[plans/generate] GET failed",
      {
        message,
      },
    );

    return json(
      {
        ok: false,
        error: message,
      },
      500,
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await getUserFromBearer(req);

    const body =
      (await req.json()) as GenerateBody;

    const assessmentId =
      String(
        body.assessment_id ?? "",
      ).trim();

    const replaceExisting =
      body.replace_existing === true;

    const baseCarePlanCsDocId =
      String(
        body.base_care_plan_cs_doc_id ??
        "",
      ).trim();

    if (!assessmentId) {
      return json({ ok: false, error: "assessment_id is required" }, 400);
    }

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from("assessments_records")
      .select("*")
      .eq("assessment_id", assessmentId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (aErr) throw aErr;
    if (!assessment) return json({ ok: false, error: "assessment not found" }, 404);

    const a =
      assessment as AssessmentRow;

    const isElderCare =
      a.service_kind === "要介護" ||
      a.service_kind === "要支援";

    if (
      isElderCare &&
      !baseCarePlanCsDocId
    ) {
      return json(
        {
          ok: false,
          error:
            "ベースとなるケアプランを選択してください。",
          error_code:
            "BASE_CARE_PLAN_REQUIRED",
        },
        422,
      );
    }

    console.info(
      "[plans/generate] selected base care plan",
      {
        assessment_id:
          a.assessment_id,
        service_kind:
          a.service_kind,
        base_care_plan_cs_doc_id:
          baseCarePlanCsDocId || null,
      },
    );

    let selectedCarePlan:
      CsDocRow | null = null;

    if (isElderCare) {
      const {
        data: carePlan,
        error: carePlanError,
      } = await supabaseAdmin
        .from("cs_docs")
        .select(
          `
        id,
        doc_name,
        summary,
        ocr_text,
        applicable_date,
        doc_date_raw,
        created_at
      `,
        )
        .eq(
          "id",
          baseCarePlanCsDocId,
        )
        .eq(
          "kaipoke_cs_id",
          a.kaipoke_cs_id,
        )
        .maybeSingle();

      if (carePlanError) {
        throw carePlanError;
      }

      if (!carePlan) {
        return json(
          {
            ok: false,
            error:
              "選択されたケアプランが見つかりません。",
            error_code:
              "BASE_CARE_PLAN_NOT_FOUND",
          },
          422,
        );
      }

      const docName =
        String(
          carePlan.doc_name ?? "",
        ).trim();

      if (
        !docName.includes(
          "居宅介護支援計画書",
        )
      ) {
        return json(
          {
            ok: false,
            error:
              "選択された文書はケアプラン（居宅介護支援計画書）ではありません。",
            error_code:
              "INVALID_BASE_CARE_PLAN",
          },
          422,
        );
      }

      const hasCarePlanContent =
        Boolean(
          String(
            carePlan.summary ?? "",
          ).trim() ||
          String(
            carePlan.ocr_text ?? "",
          ).trim(),
        );

      if (!hasCarePlanContent) {
        return json(
          {
            ok: false,
            error:
              "選択されたケアプランにサマリーまたはOCR本文がありません。",
            error_code:
              "BASE_CARE_PLAN_CONTENT_EMPTY",
          },
          422,
        );
      }

      selectedCarePlan =
        carePlan as CsDocRow;

      console.info(
        "[plans/generate] base care plan loaded",
        {
          assessment_id:
            a.assessment_id,

          cs_doc_id:
            selectedCarePlan.id,

          doc_name:
            selectedCarePlan.doc_name,

          applicable_date:
            selectedCarePlan.applicable_date,

          summary_chars:
            selectedCarePlan.summary?.length ??
            0,

          ocr_chars:
            selectedCarePlan.ocr_text?.length ??
            0,
        },
      );
    }

    const { data: sourceRows, error: sErr } =
      await supabaseAdmin
        .from("plan_generation_source_view")
        .select(`
        template_id,
        kaipoke_cs_id,
        weekday,
        weekday_jp,
        start_time,
        end_time,
        duration_minutes,
        service_code,
        required_staff_count,
        two_person_work_flg,
        active,
        effective_from,
        effective_to,
        is_biweekly,
        nth_weeks,
        invalid_time,
        overlaps_same_weekday,
        shift_service_code_id,
        kaipoke_servicek,
        kaipoke_servicecode,
        plan_document_kind,
        plan_service_category,
        plan_display_name
      `)
        .eq("kaipoke_cs_id", a.kaipoke_cs_id)
        .order("plan_document_kind", { ascending: true })
        .order("weekday", { ascending: true })
        .order("start_time", { ascending: true });

    if (sErr) throw sErr;

    /*
     * アセスメントのサービス種別に応じて、
     * 生成対象となる計画書種別を切り替える。
     */
    const targetDocumentKinds: PlanDocumentKind[] =
      isElderCare
        ? a.service_kind === "要支援"
          ? [
            "訪問介護予防サービス",
            "訪問介護サービス",
          ]
          : [
            "訪問介護サービス",
            "訪問介護予防サービス",
          ]
        : [
          "障害福祉サービス",
          "移動支援サービス",
        ];

    const rows =
      ((sourceRows ?? []) as SourceRow[]).filter(
        (row) =>
          row.plan_document_kind !== null &&
          targetDocumentKinds.includes(
            row.plan_document_kind,
          ),
      );

    if (rows.length === 0) {
      return json(
        {
          ok: false,

          error: isElderCare
            ? "対象となる訪問介護の週間シフトがありません。訪問介護サービスまたは訪問介護予防サービスの週間シフトを確認してください。"
            : "対象週間シフトがありません。障害福祉サービスまたは移動支援サービスの週間シフトを確認してください。",

          error_code:
            "PLAN_SOURCE_SHIFT_NOT_FOUND",

          target_document_kinds:
            targetDocumentKinds,
        },
        422,
      );
    }

    const grouped =
      targetDocumentKinds.reduce(
        (
          result,
          documentKind,
        ) => {
          result[documentKind] =
            rows.filter(
              (row) =>
                row.plan_document_kind ===
                documentKind,
            );

          return result;
        },
        {} as Record<
          PlanDocumentKind,
          SourceRow[]
        >,
      );

    const targets =
      targetDocumentKinds.filter(
        (documentKind) =>
          grouped[documentKind].length > 0,
      );

    console.info(
      "[plans/generate] target shifts resolved",
      {
        assessment_id:
          a.assessment_id,

        service_kind:
          a.service_kind,

        is_elder_care:
          isElderCare,

        target_document_kinds:
          targetDocumentKinds,

        source_row_count:
          sourceRows?.length ?? 0,

        matched_row_count:
          rows.length,

        targets,

        target_counts:
          Object.fromEntries(
            targets.map(
              (documentKind) => [
                documentKind,
                grouped[documentKind].length,
              ],
            ),
          ),
      },
    );

    const extracted = extractAssessmentTexts(a.content ?? {});
    const source =
      await buildPlanSourceText(
        a,
        selectedCarePlan,
      );

    console.info(
      "[plans/generate] source prepared",
      {
        assessment_id:
          a.assessment_id,

        service_kind:
          a.service_kind,

        base_care_plan_cs_doc_id:
          selectedCarePlan?.id ??
          null,

        source_labels:
          source.sourceLabels,

        source_chars:
          source.text.length,

        selected_care_plan_summary_chars:
          selectedCarePlan?.summary
            ?.length ?? 0,

        selected_care_plan_ocr_chars:
          selectedCarePlan?.ocr_text
            ?.length ?? 0,
      },
    );

    console.info("[plans/generate] source built", {
      assessment_id: a.assessment_id,
      kaipoke_cs_id: a.kaipoke_cs_id,
      source_labels: source.sourceLabels,
      source_chars: source.text.length,
    });

    if (!source.hasUsableSource) {
      return json(
        {
          ok: false,
          error:
            "基本情報、サービス等利用計画、担当者会議議事録のいずれも無いため、プランを自動生成できません。",
          source_labels: source.sourceLabels,
        },
        400,
      );
    }

    const headerDraft = await buildPlanHeaderDraft({
      sourceText: source.text,
      extracted,
    });

    console.info(
      "[plans/generate] care plan goals extracted",
      {
        assessment_id:
          a.assessment_id,

        base_care_plan_cs_doc_id:
          selectedCarePlan?.id ??
          null,

        goal_count:
          headerDraft
            .care_plan_goals
            .length,

        goals:
          headerDraft
            .care_plan_goals
            .map((goal, index) => ({
              display_order:
                index + 1,

              long_term_goal:
                goal.long_term_goal,

              long_term_goal_start_date:
                goal.long_term_goal_start_date,

              long_term_goal_end_date:
                goal.long_term_goal_end_date,

              short_term_goal:
                goal.short_term_goal,

              short_term_goal_start_date:
                goal.short_term_goal_start_date,

              short_term_goal_end_date:
                goal.short_term_goal_end_date,

              source_text:
                goal.source_text,
            })),
      },
    );

    /*
     * 介護保険プランでは、
     * ケアプラン由来の長期・短期目標が
     * 必ず1組以上必要。
     */
    if (
      isElderCare &&
      headerDraft.care_plan_goals.length === 0
    ) {
      return json(
        {
          ok: false,
          error:
            "選択したケアプランから、訪問介護に関連する長期目標・短期目標を抽出できませんでした。ケアプランの内容を確認してください。",
          error_code:
            "CARE_PLAN_GOALS_NOT_FOUND",
          base_care_plan_cs_doc_id:
            selectedCarePlan?.id ?? null,
        },
        422,
      );
    }

    const results: unknown[] = [];

    for (const kind of targets) {
      const targetRows = grouped[kind];

      if (replaceExisting) {
        const { data: oldPlans, error: oldErr } = await supabaseAdmin
          .from("plans")
          .select("plan_id")
          .eq("assessment_id", a.assessment_id)
          .eq("plan_document_kind", kind)
          .eq("is_deleted", false);

        if (oldErr) throw oldErr;

        const oldIds =
          (oldPlans ?? []).map(
            (plan) => plan.plan_id,
          );

        if (oldIds.length > 0) {
          /*
           * 旧プランに紐づく長期目標を取得する。
           * 短期目標にはplan_idがないため、
           * 長期目標IDを経由して無効化する。
           */
          const {
            data: oldLongTermGoals,
            error: oldLongTermGoalFetchError,
          } = await supabaseAdmin
            .from("plan_long_term_goals")
            .select(
              "plan_long_term_goal_id",
            )
            .in(
              "plan_id",
              oldIds,
            )
            .eq(
              "active",
              true,
            );

          if (oldLongTermGoalFetchError) {
            throw oldLongTermGoalFetchError;
          }

          const oldLongTermGoalIds =
            (oldLongTermGoals ?? []).map(
              (goal) =>
                goal.plan_long_term_goal_id,
            );

          /*
           * 先に短期目標を無効化する。
           */
          if (
            oldLongTermGoalIds.length > 0
          ) {
            const {
              error:
              shortTermGoalOffError,
            } = await supabaseAdmin
              .from(
                "plan_short_term_goals",
              )
              .update({
                active: false,
              })
              .in(
                "plan_long_term_goal_id",
                oldLongTermGoalIds,
              );

            if (shortTermGoalOffError) {
              throw shortTermGoalOffError;
            }
          }

          /*
           * 長期目標を無効化する。
           */
          const {
            error: longTermGoalOffError,
          } = await supabaseAdmin
            .from(
              "plan_long_term_goals",
            )
            .update({
              active: false,
            })
            .in(
              "plan_id",
              oldIds,
            );

          if (longTermGoalOffError) {
            throw longTermGoalOffError;
          }

          /*
           * 旧サービスを無効化する。
           */
          const {
            error: serviceOffError,
          } = await supabaseAdmin
            .from("plan_services")
            .update({
              active: false,
            })
            .in(
              "plan_id",
              oldIds,
            );

          if (serviceOffError) {
            throw serviceOffError;
          }

          /*
           * 旧プラン本体をアーカイブする。
           */
          const {
            error: planOffError,
          } = await supabaseAdmin
            .from("plans")
            .update({
              is_deleted: true,
              status: "archived",
            })
            .in(
              "plan_id",
              oldIds,
            );

          if (planOffError) {
            throw planOffError;
          }

          console.info(
            "[plans/generate] old plans archived",
            {
              assessment_id:
                a.assessment_id,

              plan_document_kind:
                kind,

              old_plan_ids:
                oldIds,

              old_long_term_goal_ids:
                oldLongTermGoalIds,
            },
          );
        }
      }

      const { data: existing, error: eErr } = await supabaseAdmin
        .from("plans")
        .select("plan_id, title, monthly_summary")
        .eq("assessment_id", a.assessment_id)
        .eq("plan_document_kind", kind)
        .eq("is_deleted", false)
        .maybeSingle();

      if (eErr) throw eErr;

      if (existing && !replaceExisting) {
        results.push({
          plan_id: existing.plan_id,
          title: existing.title,
          plan_document_kind: kind,
          skipped: true,
        });
        continue;
      }

      const monthlySummary = calcMonthlySummary(targetRows);

      const serviceDraftByCategory = await buildServiceDraftsByCategory({
        sourceText: source.text,
        assessmentContent: a.content ?? {},
        targetRows,
      });

      const { data: insertedPlan, error: pErr } = await supabaseAdmin
        .from("plans")
        .insert({
          assessment_id: a.assessment_id,
          client_info_id: a.client_info_id,
          kaipoke_cs_id: a.kaipoke_cs_id,
          plan_document_kind: kind,

          /*
           * 要介護・要支援の場合は、
           * 選択した居宅介護支援計画書を保存する。
           * 障害プランでは null。
           */
          base_care_plan_cs_doc_id:
            selectedCarePlan?.id ?? null,

          title: TITLE_MAP[kind],
          version_no: 1,
          status: "generated",
          issued_on: null,
          plan_start_date: a.assessed_on,
          plan_end_date: null,
          author_user_id: a.author_user_id,
          author_name: a.author_name,
          person_family_hope: headerDraft.person_family_hope,
          assistance_goal: headerDraft.assistance_goal,
          remarks: null,
          weekly_plan_comment: null,
          monthly_summary: monthlySummary,

          content: {
            assessment_content: a.content,
            source_count: targetRows.length,

            /*
             * 画面表示や将来の確認用として、
             * 基準ケアプランの概要も保存する。
             */
            base_care_plan:
              selectedCarePlan
                ? {
                  cs_doc_id:
                    selectedCarePlan.id,

                  doc_name:
                    selectedCarePlan.doc_name,

                  applicable_date:
                    selectedCarePlan.applicable_date,

                  doc_date_raw:
                    selectedCarePlan.doc_date_raw,

                  created_at:
                    selectedCarePlan.created_at,
                }
                : null,
          },

          generation_meta: {
            generated_at:
              new Date().toISOString(),

            source:
              "plan_generation_source_view",

            warnings:
              buildWarnings(targetRows),

            base_care_plan_cs_doc_id:
              selectedCarePlan?.id ?? null,
          },

          is_deleted: false,
        })
        .select(
          `
      plan_id,
      title,
      plan_document_kind,
      monthly_summary,
      base_care_plan_cs_doc_id
    `,
        )
        .single();

      if (pErr) throw pErr;
      if (!insertedPlan) {
        throw new Error(
          "plan insert failed",
        );
      }

      /*
       * 選択されたケアプランから抽出した
       * 長期目標・短期目標を保存する。
       */
      const insertedGoalResults: Array<{
        plan_long_term_goal_id: string;
        plan_short_term_goal_id: string;
      }> = [];

      const shortTermGoalIdMap =
        new Map<number, string>();

      for (
        let goalIndex = 0;
        goalIndex <
        headerDraft.care_plan_goals.length;
        goalIndex += 1
      ) {
        const goal =
          headerDraft.care_plan_goals[
          goalIndex
          ];

        const displayOrder =
          goalIndex + 1;

        const sourceGoalKey =
          `care-plan-goal-${displayOrder}`;

        const {
          data: insertedLongTermGoal,
          error: longTermGoalError,
        } = await supabaseAdmin
          .from("plan_long_term_goals")
          .insert({
            plan_id:
              insertedPlan.plan_id,

            display_order:
              displayOrder,

            goal_start_date:
              goal.long_term_goal_start_date,

            goal_end_date:
              goal.long_term_goal_end_date,

            goal_text:
              goal.long_term_goal,

            achievement_level:
              "未選択",

            effectiveness_satisfaction:
              null,

            source_cs_doc_id:
              selectedCarePlan?.id ??
              null,

            source_goal_key:
              `${sourceGoalKey}-long`,

            source_goal_text:
              goal.long_term_goal,

            source_snapshot: {
              base_care_plan_cs_doc_id:
                selectedCarePlan?.id ??
                null,

              source_text:
                goal.source_text,

              extracted_long_term_goal:
                goal.long_term_goal,

              extracted_long_term_goal_start_date:
                goal.long_term_goal_start_date,

              extracted_long_term_goal_end_date:
                goal.long_term_goal_end_date,

              extracted_short_term_goal:
                goal.short_term_goal,

              extracted_short_term_goal_start_date:
                goal.short_term_goal_start_date,

              extracted_short_term_goal_end_date:
                goal.short_term_goal_end_date,
            },
            generation_meta: {
              generated_at:
                new Date().toISOString(),

              source:
                "selected_care_plan",

              extraction_model:
                "gpt-4.1-mini",

              display_order:
                displayOrder,
            },

            active: true,
          })
          .select(
            `
        plan_long_term_goal_id
      `,
          )
          .single();

        if (longTermGoalError) {
          throw longTermGoalError;
        }

        if (!insertedLongTermGoal) {
          throw new Error(
            "long term goal insert failed",
          );
        }

        const {
          data: insertedShortTermGoal,
          error: shortTermGoalError,
        } = await supabaseAdmin
          .from("plan_short_term_goals")
          .insert({
            plan_long_term_goal_id:
              insertedLongTermGoal
                .plan_long_term_goal_id,

            display_order: 1,

            goal_start_date:
              goal.short_term_goal_start_date,

            goal_end_date:
              goal.short_term_goal_end_date,

            goal_text:
              goal.short_term_goal,

            achievement_level:
              "未選択",

            effectiveness_satisfaction:
              null,

            source_cs_doc_id:
              selectedCarePlan?.id ??
              null,

            source_goal_key:
              `${sourceGoalKey}-short`,

            source_goal_text:
              goal.short_term_goal,

            source_snapshot: {
              base_care_plan_cs_doc_id:
                selectedCarePlan?.id ??
                null,

              source_text:
                goal.source_text,

              extracted_long_term_goal:
                goal.long_term_goal,

              extracted_long_term_goal_start_date:
                goal.long_term_goal_start_date,

              extracted_long_term_goal_end_date:
                goal.long_term_goal_end_date,

              extracted_short_term_goal:
                goal.short_term_goal,

              extracted_short_term_goal_start_date:
                goal.short_term_goal_start_date,

              extracted_short_term_goal_end_date:
                goal.short_term_goal_end_date,
            },

            generation_meta: {
              generated_at:
                new Date().toISOString(),

              source:
                "selected_care_plan",

              extraction_model:
                "gpt-4.1-mini",

              display_order: 1,
            },

            active: true,
          })
          .select(
            `
        plan_short_term_goal_id
      `,
          )
          .single();

        if (shortTermGoalError) {
          throw shortTermGoalError;
        }

        if (!insertedShortTermGoal) {
          throw new Error(
            "short term goal insert failed",
          );
        }

        insertedGoalResults.push({
          plan_long_term_goal_id:
            insertedLongTermGoal
              .plan_long_term_goal_id,

          plan_short_term_goal_id:
            insertedShortTermGoal
              .plan_short_term_goal_id,
        });

        shortTermGoalIdMap.set(
          goalIndex,
          insertedShortTermGoal
            .plan_short_term_goal_id,
        );
      }

      console.info(
        "[plans/generate] care plan goals saved",
        {
          plan_id:
            insertedPlan.plan_id,

          base_care_plan_cs_doc_id:
            selectedCarePlan?.id ??
            null,

          saved_goal_count:
            insertedGoalResults.length,

          goal_ids:
            insertedGoalResults,
        },
      );

      const planServices =
        targetRows.map(
          (row, index) => {
            const duration = row.duration_minutes ?? 0;
            const factor = calcFactor(row);
            const monthlyMinutes = Math.round(duration * factor);

            const draftKey = buildServiceDraftKey(row);
            const draft = serviceDraftByCategory[draftKey] ?? fallbackServiceDraft();

            return {
              plan_id: insertedPlan.plan_id,
              template_id: row.template_id ?? null,
              shift_service_code_id: row.shift_service_code_id ?? null,
              service_code: row.service_code ?? null,
              plan_document_kind: kind,
              plan_service_category: row.plan_service_category ?? null,
              display_order: index + 1,
              service_no: index + 1,
              weekday: row.weekday ?? null,
              weekday_jp: row.weekday_jp ?? null,
              start_time: row.start_time ?? null,
              end_time: row.end_time ?? null,
              duration_minutes: duration,
              is_biweekly: !!row.is_biweekly,
              nth_weeks: row.nth_weeks ?? null,
              monthly_occurrence_factor: factor,
              monthly_minutes: monthlyMinutes,
              monthly_hours: round2(monthlyMinutes / 60),
              required_staff_count: row.required_staff_count ?? 1,
              two_person_work_flg: !!row.two_person_work_flg,
              service_title:
                row.plan_display_name ??
                row.plan_service_category ??
                row.service_code ??
                null,
              service_detail: draft.service_detail,
              procedure_notes: draft.procedure_notes,
              observation_points: null,
              family_action: draft.family_action,
              schedule_note: buildScheduleNote(row),
              source_snapshot: {
                template_id: row.template_id,
                service_code: row.service_code,
                weekday: row.weekday,
                start_time: row.start_time,
                end_time: row.end_time,
                duration_minutes: row.duration_minutes,
                effective_from: row.effective_from,
                effective_to: row.effective_to,
              },
              generation_meta: {
                generated_at: new Date().toISOString(),
                invalid_time: row.invalid_time ?? false,
                overlaps_same_weekday: row.overlaps_same_weekday ?? false,
                service_draft_key: draftKey,
              },
              active: true,
            };
          });

      type InsertedPlanServiceRow = {
        plan_service_id: string;
        service_no: number;
        display_order: number;
        plan_service_category: string | null;
        service_title: string | null;
        service_code: string | null;
      };

      let insertedPlanServices:
        InsertedPlanServiceRow[] = [];

      if (planServices.length > 0) {
        const {
          data: insertedServices,
          error: psErr,
        } = await supabaseAdmin
          .from("plan_services")
          .insert(planServices)
          .select(
            `
        plan_service_id,
        service_no,
        display_order,
        plan_service_category,
        service_title,
        service_code
      `,
          );

        if (psErr) {
          throw psErr;
        }

        insertedPlanServices =
          (insertedServices ??
            []) as InsertedPlanServiceRow[];

        if (
          insertedPlanServices.length !==
          planServices.length
        ) {
          throw new Error(
            `plan services insert count mismatch: expected=${planServices.length}, actual=${insertedPlanServices.length}`,
          );
        }
      }

      /*
       * 登録済みサービスと短期目標の関連をAIで判定する。
       */
      const serviceGoalRelations =
        await buildServiceGoalRelations({
          sourceText:
            source.text,

          planServices:
            insertedPlanServices.map(
              (service) => {
                const sourceService =
                  planServices.find(
                    (item) =>
                      item.service_no ===
                      service.service_no,
                  );

                return {
                  service_no:
                    service.service_no,

                  plan_service_category:
                    service.plan_service_category,

                  service_title:
                    service.service_title,

                  service_code:
                    service.service_code,

                  service_detail:
                    sourceService
                      ?.service_detail ??
                    null,

                  procedure_notes:
                    sourceService
                      ?.procedure_notes ??
                    null,
                };
              },
            ),

          carePlanGoals:
            headerDraft.care_plan_goals,
        });

      /*
       * AIの判定結果を、中間テーブルへ保存できる形に変換する。
       */
      const relationRows =
        serviceGoalRelations
          .map((relation) => {
            const service =
              insertedPlanServices.find(
                (item) =>
                  item.service_no ===
                  relation.service_no,
              );

            const shortTermGoalId =
              shortTermGoalIdMap.get(
                relation.short_term_goal_index,
              );

            if (
              !service ||
              !shortTermGoalId
            ) {
              return null;
            }

            return {
              plan_service_id:
                service.plan_service_id,

              plan_short_term_goal_id:
                shortTermGoalId,

              display_order: 1,

              relation_note:
                relation.relation_note,

              source_snapshot: {
                service_no:
                  relation.service_no,

                short_term_goal_index:
                  relation.short_term_goal_index,
              },

              generation_meta: {
                generated_at:
                  new Date().toISOString(),

                source:
                  "gpt-4.1-mini",

                extraction:
                  "service_goal_relation",
              },

              active: true,
            };
          })
          .filter(
            (
              item,
            ): item is {
              plan_service_id: string;
              plan_short_term_goal_id: string;
              display_order: number;
              relation_note: string;
              source_snapshot: {
                service_no: number;
                short_term_goal_index: number;
              };
              generation_meta: {
                generated_at: string;
                source: string;
                extraction: string;
              };
              active: boolean;
            } =>
              item !== null,
          );

      /*
       * 中間テーブルへ保存する。
       */
      if (relationRows.length > 0) {
        const {
          error:
          relationInsertError,
        } = await supabaseAdmin
          .from(
            "plan_service_short_term_goals",
          )
          .insert(
            relationRows,
          );

        if (relationInsertError) {
          throw relationInsertError;
        }
      }

      console.info(
        "[plans/generate] service goal relations saved",
        {
          plan_id:
            insertedPlan.plan_id,

          relation_count:
            relationRows.length,

          relations:
            serviceGoalRelations,
        },
      );

      console.info(
        "[plans/generate] plan services saved",
        {
          plan_id:
            insertedPlan.plan_id,

          plan_document_kind:
            kind,

          service_count:
            insertedPlanServices.length,

          services:
            insertedPlanServices.map(
              (service) => ({
                plan_service_id:
                  service.plan_service_id,

                service_no:
                  service.service_no,

                display_order:
                  service.display_order,

                plan_service_category:
                  service.plan_service_category,

                service_title:
                  service.service_title,

                service_code:
                  service.service_code,
              }),
            ),
        },
      );

      results.push({
        plan_id:
          insertedPlan.plan_id,

        title:
          insertedPlan.title,

        plan_document_kind:
          kind,

        base_care_plan_cs_doc_id:
          insertedPlan
            .base_care_plan_cs_doc_id ??
          null,

        care_plan_goal_count:
          insertedGoalResults.length,

        care_plan_goal_ids:
          insertedGoalResults,

        service_goal_relation_count:
          serviceGoalRelations.length,

        service_goal_relations:
          serviceGoalRelations,

        service_count:
          insertedPlanServices.length,

        plan_service_ids:
          insertedPlanServices.map(
            (service) =>
              service.plan_service_id,
          ),

        monthly_summary:
          monthlySummary,
      });
    }

    return json({
      ok: true,
      assessment_id: a.assessment_id,
      plans: results,
      warnings: buildWarnings(rows),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[plans/generate] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}

function removePersonNames(text: string): string {
  return text
    .replace(/[一-龥ぁ-んァ-ヶー]{2,10}様/g, "本人")
    .replace(/[一-龥ぁ-んァ-ヶー]{2,10}さん/g, "本人")
    .replace(/\s+/g, " ")
    .trim();
}

async function buildVisitNotesText(a: AssessmentRow): Promise<string> {
  const baseDate = a.assessed_on ? new Date(a.assessed_on) : new Date();
  const fromDate = new Date(baseDate);
  fromDate.setMonth(fromDate.getMonth() - 3);

  const from = ymd(fromDate);
  const to = ymd(baseDate);

  const { data, error } = await supabaseAdmin
    .from("shift")
    .select(`
      shift_start_date,
      shift_start_time,
      shift_end_time,
      tokutei_comment,
      service_code
    `)
    .eq("kaipoke_cs_id", a.kaipoke_cs_id)
    .gte("shift_start_date", from)
    .lte("shift_start_date", to)
    .not("tokutei_comment", "is", null)
    .order("shift_start_date", { ascending: false })
    .order("shift_start_time", { ascending: false })
    .limit(30);

  if (error) {
    console.warn("[plans/generate] visit notes fetch failed", error.message);
    return "";
  }

  const rows = ((data ?? []) as VisitNoteRow[])
    .map((r) => {
      const comment = r.tokutei_comment?.trim();
      if (!comment) return "";

      return [
        `日付: ${r.shift_start_date ?? ""}`,
        `時間: ${(r.shift_start_time ?? "").slice(0, 5)}-${(r.shift_end_time ?? "").slice(0, 5)}`,
        r.service_code ? `サービス: ${r.service_code}` : "",
        `記録: ${comment}`,
      ]
        .filter(Boolean)
        .join(" / ");
    })
    .filter(Boolean);

  if (rows.length === 0) return "";

  return `【直近の訪問介護記録・特定コメント】\n${rows.join("\n")}`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}