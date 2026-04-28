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
  doc_name: string | null;
  summary: string | null;
  ocr_text: string | null;
  created_at: string | null;
};

type ServiceTextDraft = {
  service_detail: string;
  procedure_notes: string;
  family_action: string;
};

type PlanHeaderDraft = {
  person_family_hope: string;
  assistance_goal: string;
};

type PlanSourceTextResult = {
  text: string;
  hasUsableSource: boolean;
  sourceLabels: string[];
};

const TITLE_MAP: Record<PlanDocumentKind, string> = {
  障害福祉サービス: "障害福祉サービス　ファミーユヘルパーサービス愛知　個別計画書",
  移動支援サービス: "移動支援サービス　ファミーユヘルパーサービス愛知　個別計画書",
  訪問介護サービス: "訪問介護サービス　ファミーユヘルパーサービス愛知　個別計画書",
  訪問介護予防サービス: "訪問介護予防サービス　ファミーユヘルパーサービス愛知　個別計画書",
  役務提供請負サービス: "役務提供請負サービス　ファミーユヘルパーサービス愛知　個別計画書",
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

async function buildPlanSourceText(a: AssessmentRow): Promise<PlanSourceTextResult> {
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
    ])
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    console.warn("[plans/generate] cs_docs fetch failed", error.message);
  }

  const sourceLabels: string[] = [];

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

  const text = [meetingMinutes, docText, assessmentText]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 14000);

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
以下の資料から、計画書に記載する「本人（家族）の希望」と「援助目標」を作成してください。

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
  "assistance_goal": ""
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

    const obj = parsed as Record<string, unknown>;

    return {
      person_family_hope: limitJapaneseText(
        typeof obj.person_family_hope === "string"
          ? obj.person_family_hope
          : fallback.person_family_hope,
        170,
      ),
      assistance_goal: normalizeGoalText(
        limitJapaneseText(
          typeof obj.assistance_goal === "string"
            ? obj.assistance_goal
            : fallback.assistance_goal,
          170,
        ),
      ),
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
      limitJapaneseText(extracted.person_family_hope?.trim() ?? "", 170),
    ),
    assistance_goal: normalizeGoalText(
      removePersonNames(
        limitJapaneseText(extracted.assistance_goal?.trim() ?? "", 170),
      ),
    ),
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
    fallback[key] = fallbackServiceDraft(row);
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
- 資料に書かれている事実・意向・会議内容だけを使ってください。
- 推測、創作、一般論による補完は禁止です。
- 利用者本人の氏名、家族氏名、職員名は本文に入れないでください。
- service_detail は50〜100文字程度。
- procedure_notes は50〜100文字程度。
- family_action は50〜100文字程度。
- service_detail は、資料から読み取れるサービス内容がある場合のみ入れてください。読み取れなければ空文字。
- procedure_notes は、資料から読み取れる手順・留意事項・観察ポイントがある場合のみ入れてください。読み取れなければ空文字。
- family_action は、資料から本人または家族に依頼・協力してもらう内容が読み取れる場合のみ入れてください。読み取れなければ空文字。
- 家事系には掃除、洗濯、調理、買い物、整理整頓など、資料から読み取れるものだけを入れてください。
- 身体系には家事だけを入れてはいけません。
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

function fallbackServiceDraft(_row: SourceRow): ServiceTextDraft {
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

export async function POST(req: NextRequest) {
  try {
    await getUserFromBearer(req);

    const body = (await req.json()) as GenerateBody;
    const assessmentId = String(body.assessment_id ?? "").trim();
    const replaceExisting = !!body.replace_existing;

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

    const a = assessment as AssessmentRow;

    const { data: sourceRows, error: sErr } = await supabaseAdmin
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

    const rows = ((sourceRows ?? []) as SourceRow[]).filter(
      (r) =>
        r.plan_document_kind === "障害福祉サービス" ||
        r.plan_document_kind === "移動支援サービス"
    );

    if (rows.length === 0) {
      return json(
        {
          ok: false,
          error: "対象週間シフトがありません。障害福祉サービス / 移動支援サービス の週間シフトを確認してください。",
        },
        400
      );
    }

    const grouped = {
      障害福祉サービス: rows.filter((r) => r.plan_document_kind === "障害福祉サービス"),
      移動支援サービス: rows.filter((r) => r.plan_document_kind === "移動支援サービス"),
    };

    const targets = (Object.keys(grouped) as Array<"障害福祉サービス" | "移動支援サービス">).filter(
      (k) => grouped[k].length > 0
    );

    const extracted = extractAssessmentTexts(a.content ?? {});
    const source = await buildPlanSourceText(a);

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

        const oldIds = (oldPlans ?? []).map((x) => x.plan_id);
        if (oldIds.length > 0) {
          const { error: svcOffErr } = await supabaseAdmin
            .from("plan_services")
            .update({ active: false })
            .in("plan_id", oldIds);

          if (svcOffErr) throw svcOffErr;

          const { error: planOffErr } = await supabaseAdmin
            .from("plans")
            .update({ is_deleted: true, status: "archived" })
            .in("plan_id", oldIds);

          if (planOffErr) throw planOffErr;
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
          },
          generation_meta: {
            generated_at: new Date().toISOString(),
            source: "plan_generation_source_view",
            warnings: buildWarnings(targetRows),
          },
          is_deleted: false,
        })
        .select("plan_id, title, plan_document_kind, monthly_summary")
        .single();

      if (pErr) throw pErr;
      if (!insertedPlan) throw new Error("plan insert failed");

      const planServices = targetRows.map((row, index) => {
        const duration = row.duration_minutes ?? 0;
        const factor = calcFactor(row);
        const monthlyMinutes = Math.round(duration * factor);

        const draftKey = buildServiceDraftKey(row);
        const draft = serviceDraftByCategory[draftKey] ?? fallbackServiceDraft(row);

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

      if (planServices.length > 0) {
        const { error: psErr } = await supabaseAdmin
          .from("plan_services")
          .insert(planServices);

        if (psErr) throw psErr;
      }

      results.push({
        plan_id: insertedPlan.plan_id,
        title: insertedPlan.title,
        plan_document_kind: kind,
        service_count: planServices.length,
        monthly_summary: monthlySummary,
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