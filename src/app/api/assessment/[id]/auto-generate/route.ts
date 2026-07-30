// src/app/api/assessment/[id]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { getDefaultElderCareAssessmentContent } from "@/lib/assessment/elder-care-template";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
}

function isElderCareKind(kind: string): kind is "要介護" | "要支援" {
    return kind === "要介護" || kind === "要支援";
}

function hasRows(content: unknown): boolean {
    const c = content as { sheets?: Array<{ rows?: unknown[] }> } | null;
    return Array.isArray(c?.sheets) && c.sheets.some((s) => Array.isArray(s.rows) && s.rows.length > 0);
}

function ensureAssessmentContent(
    serviceKind: string,
    content: unknown,
): AssessmentContent | unknown {
    /*
     * 要介護・要支援の場合は、既存contentの構造にかかわらず
     * 必ず介護用（カイポケライク）のテンプレートを使う。
     *
     * 既存contentが障害形式だった場合に、その構造へ戻ることを防ぐ。
     */
    if (isElderCareKind(serviceKind)) {
        return getDefaultElderCareAssessmentContent(
            serviceKind,
        );
    }

    /*
     * 障害・移動支援などは、現在のcontentに行がある場合、
     * その構造をテンプレートとして使用する。
     */
    if (hasRows(content)) {
        return content;
    }

    return content;
}

type Ctx = { params: Promise<{ id: string }> };

type CsDocRow = {
    id: string;
    created_at: string;
    kaipoke_cs_id: string | null;
    doc_name: string | null;
    ocr_text: string | null;
    summary: string | null;
};

type ShiftRow = {
    shift_id: number;
    shift_start_date: string | null; // date
    shift_start_time: string | null; // time
    tokutei_comment: string | null;
};

type AssessmentChoiceOption = {
    value: string;
    label: string;
};

type AssessmentRow = {
    key: string;
    label: string;
    check: "NONE" | "CIRCLE";
    remark: string;
    hope: string;

    inputType?:
    | "text"
    | "textarea"
    | "radio"
    | "checkbox"
    | "number"
    | "date";

    value?: string;
    defaultValue?: string;
    options?: AssessmentChoiceOption[];

    unit?: string;
    placeholder?: string;
    group?: string;
    width?: "full" | "half" | "third" | "quarter";
};

type AssessmentSheet = {
    key: string;
    title: string;
    printTarget: boolean;
    rows: AssessmentRow[];

    layout?:
    | "basic-information"
    | "service-frequency"
    | "housing"
    | "health"
    | "special"
    | "adl"
    | "cognition";
};
type AssessmentContent = {
    version: number;
    sheets: AssessmentSheet[];
};

// OpenAIが返してきがちな “不足フィールドあり” JSON を受ける型
type GeneratedRowPartial = {
    key?: unknown;
    label?: unknown;
    check?: unknown;
    remark?: unknown;
    hope?: unknown;
    value?: unknown;
};

type GeneratedSheetPartial = {
    key?: unknown;
    rows?: unknown;
};

type GeneratedContentPartial = {
    version?: unknown;
    sheets?: unknown;
};

const CORE_DOC_NAMES = [
    "基本情報(ステップ２）",
    "基本情報",
    "サービス等利用計画",
    "障害福祉サービス等利用計画",
    "サービス等利用計画案",
] as const;

const OPTIONAL_DOC_NAMES = ["情報連携・看護サマリー等"] as const;

function trimOrEmpty(v: unknown) {
    return typeof v === "string" ? v.trim() : "";
}

function ymd(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function take(s: string, max: number) {
    if (s.length <= max) return s;
    return s.slice(0, max) + "\n...(truncated)";
}

// summary があっても OCR も一部併用したい（情報量が増える）
// ただし巨大化しやすいので上限を持つ
function pickText(row: CsDocRow, maxOcr: number) {
    const summary = trimOrEmpty(row.summary);
    const ocr = trimOrEmpty(row.ocr_text);

    if (summary && ocr) {
        const o = take(ocr, maxOcr);
        return { text: `${summary}\n\n[OCR]\n${o}`, use: "summary+ocr" as const };
    }
    if (summary) return { text: summary, use: "summary" as const };
    if (ocr) return { text: take(ocr, maxOcr), use: "ocr_text" as const };
    return { text: "", use: "none" as const };
}

function isAssessmentContent(v: unknown): v is AssessmentContent {
    if (!v || typeof v !== "object") return false;
    const obj = v as { version?: unknown; sheets?: unknown };

    if (typeof obj.version !== "number") return false;
    if (!Array.isArray(obj.sheets)) return false;

    for (const s of obj.sheets) {
        if (!s || typeof s !== "object") return false;
        const sh = s as { key?: unknown; title?: unknown; printTarget?: unknown; rows?: unknown };

        if (typeof sh.key !== "string") return false;
        if (typeof sh.title !== "string") return false;
        if (typeof sh.printTarget !== "boolean") return false;
        if (!Array.isArray(sh.rows)) return false;

        for (const r of sh.rows) {
            if (!r || typeof r !== "object") return false;
            const row = r as { key?: unknown; label?: unknown; check?: unknown; remark?: unknown; hope?: unknown };

            if (typeof row.key !== "string") return false;
            if (typeof row.label !== "string") return false;
            if (row.check !== "NONE" && row.check !== "CIRCLE") return false;
            if (
                row.remark !== undefined &&
                typeof row.remark !== "string"
            ) {
                return false;
            }

            if (
                row.hope !== undefined &&
                typeof row.hope !== "string"
            ) {
                return false;
            }
        }
    }
    return true;
}

// OpenAIの “部分JSON” を読み取り、templateにマージして正規化
// OpenAIの “部分JSON” を読み取り、templateにマージして正規化
// key完全一致を優先し、失敗した場合は label 一致でも拾う
function normalizeByTemplate(
    template: AssessmentContent,
    generatedUnknown: unknown,
): AssessmentContent {
    const gen =
        generatedUnknown as GeneratedContentPartial;

    const genSheets: GeneratedSheetPartial[] =
        Array.isArray(gen?.sheets)
            ? (gen.sheets as GeneratedSheetPartial[])
            : [];

    type GeneratedRowWithSheet = {
        sheetKey: string;
        row: GeneratedRowPartial;
    };

    const generatedRowsWithSheet: GeneratedRowWithSheet[] = [];

    for (const sheet of genSheets) {
        const sheetKey =
            typeof sheet?.key === "string"
                ? sheet.key
                : "";

        const rows: GeneratedRowPartial[] =
            Array.isArray(sheet?.rows)
                ? (sheet.rows as GeneratedRowPartial[])
                : [];

        for (const row of rows) {
            if (
                row &&
                typeof row === "object"
            ) {
                generatedRowsWithSheet.push({
                    sheetKey,
                    row,
                });
            }
        }
    }

    const merged: AssessmentContent = {
        /*
         * versionを含め、テンプレート側のトップレベル情報を維持する。
         */
        ...template,

        sheets: template.sheets.map(
            (templateSheet) => ({
                /*
                 * layoutなど、介護用テンプレート固有の情報を維持する。
                 */
                ...templateSheet,

                rows: templateSheet.rows.map(
                    (templateRow) => {
                        const sameSheetRows =
                            generatedRowsWithSheet.filter(
                                (item) =>
                                    item.sheetKey ===
                                    templateSheet.key,
                            );

                        const sameSheetKeyMatches =
                            sameSheetRows.filter(
                                (item) =>
                                    typeof item.row.key ===
                                    "string" &&
                                    item.row.key ===
                                    templateRow.key,
                            );

                        const sameSheetLabelMatches =
                            sameSheetRows.filter(
                                (item) =>
                                    typeof item.row.label ===
                                    "string" &&
                                    item.row.label ===
                                    templateRow.label,
                            );

                        const globalKeyMatches =
                            generatedRowsWithSheet.filter(
                                (item) =>
                                    typeof item.row.key ===
                                    "string" &&
                                    item.row.key ===
                                    templateRow.key,
                            );

                        const globalLabelMatches =
                            generatedRowsWithSheet.filter(
                                (item) =>
                                    typeof item.row.label ===
                                    "string" &&
                                    item.row.label ===
                                    templateRow.label,
                            );

                        const generatedRow =
                            sameSheetKeyMatches.length === 1
                                ? sameSheetKeyMatches[0].row
                                : sameSheetLabelMatches.length === 1
                                    ? sameSheetLabelMatches[0].row
                                    : globalKeyMatches.length === 1
                                        ? globalKeyMatches[0].row
                                        : globalLabelMatches.length === 1
                                            ? globalLabelMatches[0].row
                                            : undefined;

                        const generatedRemark =
                            typeof generatedRow?.remark ===
                                "string"
                                ? generatedRow.remark.trim()
                                : "";

                        const generatedHope =
                            typeof generatedRow?.hope ===
                                "string"
                                ? generatedRow.hope.trim()
                                : "";

                        const generatedValue =
                            typeof generatedRow?.value ===
                                "string"
                                ? generatedRow.value.trim()
                                : "";

                        const templateRemark =
                            typeof templateRow.remark ===
                                "string"
                                ? templateRow.remark
                                : "";

                        const templateHope =
                            typeof templateRow.hope ===
                                "string"
                                ? templateRow.hope
                                : "";

                        const templateValue =
                            typeof templateRow.value ===
                                "string"
                                ? templateRow.value
                                : "";

                        const remark =
                            generatedRemark ||
                            templateRemark;

                        const hope =
                            generatedHope ||
                            templateHope;

                        /*
                         * AIがvalueを返していれば採用。
                         * 返していなければテンプレート初期値を維持する。
                         */
                        const value =
                            generatedValue ||
                            templateValue ||
                            templateRow.defaultValue ||
                            "";

                        const generatedCheck =
                            generatedRow?.check ===
                                "CIRCLE" ||
                                generatedRow?.check ===
                                "NONE"
                                ? generatedRow.check
                                : null;

                        const hasSelectedValue =
                            value !== "" &&
                            value !== "00";

                        const check:
                            | "NONE"
                            | "CIRCLE" =
                            remark ||
                                hope ||
                                hasSelectedValue
                                ? "CIRCLE"
                                : generatedCheck ??
                                templateRow.check ??
                                "NONE";

                        return {
                            /*
                             * 最重要：
                             * inputType・options・group・widthなどを
                             * すべて残す。
                             */
                            ...templateRow,

                            check,
                            remark,
                            hope,

                            ...(templateRow.inputType
                                ? { value }
                                : {}),
                        };
                    },
                ),
            }),
        ),
    };

    return merged;
}

function countFilled(content: AssessmentContent): number {
    let n = 0;
    for (const s of content.sheets) {
        for (const r of s.rows) {
            const remark = trimOrEmpty(r.remark);
            const hope = trimOrEmpty(r.hope);
            if (remark || hope || r.check === "CIRCLE") n++;
        }
    }
    return n;
}

export async function POST(req: NextRequest, { params }: Ctx) {
    try {
        await getUserFromBearer(req);
        const { id } = await params;

        // 1) assessment取得
        const { data: assessment, error: aErr } = await supabaseAdmin
            .from("assessments_records")
            .select("*")
            .eq("assessment_id", id)
            .eq("is_deleted", false)
            .maybeSingle();

        if (aErr) throw aErr;
        if (!assessment) return json({ ok: false, error: "assessment not found" }, 404);

        const meetingMinutes = trimOrEmpty(assessment.meeting_minutes);

        const kaipokeCsId = trimOrEmpty(assessment.kaipoke_cs_id);
        if (!kaipokeCsId) return json({ ok: false, error: "kaipoke_cs_id is empty" }, 400);

        const serviceKind =
            trimOrEmpty(assessment.service_kind);

        if (!serviceKind) {
            return json(
                {
                    ok: false,
                    error:
                        "assessment.service_kind が設定されていません",
                },
                400,
            );
        }

        const baseContent =
            ensureAssessmentContent(
                serviceKind,
                assessment.content,
            );

        const templateUnknown: unknown = baseContent ?? null;
        if (!isAssessmentContent(templateUnknown)) {
            return json({ ok: false, error: "baseContent is not valid AssessmentContent" }, 400);
        }
        const templateContent = templateUnknown;

        const baseCreatedAtIso = typeof assessment.created_at === "string" ? assessment.created_at : new Date().toISOString();
        const baseDate = new Date(baseCreatedAtIso);
        const fromDate = new Date(baseDate);
        fromDate.setDate(fromDate.getDate() - 30);

        // 2) cs_docs 取得（コア2 + 任意）
        const { data: docs, error: dErr } = await supabaseAdmin
            .from("cs_docs")
            .select("id, created_at, kaipoke_cs_id, doc_name, ocr_text, summary")
            .eq("kaipoke_cs_id", kaipokeCsId)
            .in("doc_name", [...CORE_DOC_NAMES, ...OPTIONAL_DOC_NAMES])
            .order("created_at", { ascending: false });

        if (dErr) throw dErr;

        const byName = new Map<string, CsDocRow[]>();
        (docs ?? []).forEach((d: CsDocRow) => {
            const name = d.doc_name ?? "";
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name)!.push(d);
        });

        const selectedDocs: Array<{ id: string; created_at: string; doc_name: string; use: string; text: string }> = [];

        type DocUse = "summary+ocr" | "summary" | "ocr_text" | "none";

        type SelectedDoc = {
            id: string;
            created_at: string;
            doc_name: string;
            use: DocUse;
            text: string;
        };

        const pickLatestByName = (name: string, maxOcr: number): SelectedDoc | null => {
            const latest = byName.get(name)?.[0];
            if (!latest) return null;
            const picked = pickText(latest, maxOcr);
            if (!picked.text) return null;
            return {
                id: latest.id,
                created_at: latest.created_at,
                doc_name: name,
                use: picked.use,   // ← DocUse に一致
                text: picked.text,
            };
        };
        // 基本情報・サービス等利用計画・任意資料を、取れるものだけ取得する
        for (const name of CORE_DOC_NAMES) {
            const picked = pickLatestByName(name, 12000);
            if (picked) selectedDocs.push(picked);
        }

        const missingOptional = OPTIONAL_DOC_NAMES.filter((n) => !(byName.get(n)?.length));

        for (const name of OPTIONAL_DOC_NAMES) {
            const opt = pickLatestByName(name, 8000);
            if (opt) selectedDocs.push(opt);
        }

        const hasCoreDoc = selectedDocs.some((d) => {
            const name = d.doc_name ?? "";
            return (
                name.includes("基本情報") ||
                name.includes("サービス等利用計画") ||
                name.includes("利用計画")
            );
        });

        const hasMeetingMinutes = !!meetingMinutes;

        // 基本情報・サービス等利用計画がなくても、議事録があれば生成OK
        if (!hasCoreDoc && !hasMeetingMinutes) {
            return json(
                {
                    ok: false,
                    error:
                        "基本情報、サービス等利用計画、担当者会議議事録のいずれも無いため、アセスメントを自動生成できません。",
                    source_labels: selectedDocs.map((d) => d.doc_name),
                    core_doc_names: CORE_DOC_NAMES,
                    optional_doc_names: OPTIONAL_DOC_NAMES,
                    has_meeting_minutes: hasMeetingMinutes,
                    kaipoke_cs_id: kaipokeCsId,
                },
                400
            );
        }
        const docsText = selectedDocs
            .map(
                (d) =>
                    `--- cs_docs: ${d.doc_name} (use=${d.use}) created_at=${d.created_at} id=${d.id} ---\n${d.text}`
            )
            .join("\n\n");

        // 3) 直近1か月の訪問記録（shift.tokutei_comment）
        const { data: shifts, error: sErr } = await supabaseAdmin
            .from("shift")
            .select("shift_id, shift_start_date, shift_start_time, tokutei_comment")
            .eq("kaipoke_cs_id", kaipokeCsId)
            .gte("shift_start_date", ymd(fromDate))
            .lte("shift_start_date", ymd(baseDate))
            .order("shift_start_date", { ascending: false })
            .order("shift_start_time", { ascending: false })
            .limit(120);

        if (sErr) throw sErr;

        const visitNotesRaw = (shifts ?? [])
            .map((r: ShiftRow) => {
                const t = trimOrEmpty(r.tokutei_comment);
                if (!t) return null;
                const d = r.shift_start_date ?? "";
                const tm = r.shift_start_time ?? "";
                return `- ${d} ${tm} (shift_id=${r.shift_id})\n${t}`;
            })
            .filter((x): x is string => x !== null)
            .join("\n\n");

        const visitNotes = visitNotesRaw ? take(visitNotesRaw, 12000) : "(直近1か月の訪問記録はありません)";

        const materials = [
            meetingMinutes ? "## 担当者会議議事録" : "",
            meetingMinutes ? meetingMinutes : "",
            meetingMinutes ? "" : "",
            "## 基本情報・サービス等利用計画等(cs_docs)",
            docsText || "(基本情報・サービス等利用計画等の資料はありません)",
            "",
            "## 直近1か月の訪問記録(shift.tokutei_comment)",
            visitNotes,
        ]
            .filter((x) => x !== "")
            .join("\n");

        const materialsChars = materials.length;

        console.log("[assessment:auto-generate] start", {
            assessment_id: id,
            kaipoke_cs_id: kaipokeCsId,

            service_kind: serviceKind,
            is_elder_care:
                isElderCareKind(serviceKind),

            template_sheet_count:
                templateContent.sheets.length,

            template_sheet_keys:
                templateContent.sheets.map(
                    (sheet) => sheet.key,
                ),

            template_row_count:
                templateContent.sheets.reduce(
                    (total, sheet) =>
                        total + sheet.rows.length,
                    0,
                ),

            docs_used:
                selectedDocs.map(
                    (d) => d.doc_name,
                ),

            missing_optional:
                missingOptional,

            has_meeting_minutes:
                hasMeetingMinutes,

            meeting_minutes_chars:
                meetingMinutes.length,

            materials_chars:
                materialsChars,

            shift_range: {
                from: ymd(fromDate),
                to: ymd(baseDate),
            },

            shifts_total:
                (shifts ?? []).length,
        });

        // テンプレート内の重複row keyを確認
        const templateKeyLocations = new Map<string, string[]>();

        for (const sheet of templateContent.sheets) {
            for (const row of sheet.rows) {
                const locations =
                    templateKeyLocations.get(row.key) ?? [];

                locations.push(
                    `${sheet.key}:${row.label}`,
                );

                templateKeyLocations.set(
                    row.key,
                    locations,
                );
            }
        }

        const duplicateTemplateKeys = [
            ...templateKeyLocations.entries(),
        ]
            .filter(
                ([, locations]) =>
                    locations.length > 1,
            )
            .map(([key, locations]) => ({
                key,
                locations,
            }));

        console.log(
            "[assessment:auto-generate] duplicate template row keys",
            {
                assessment_id: id,
                service_kind: serviceKind,
                duplicate_count:
                    duplicateTemplateKeys.length,
                duplicates:
                    duplicateTemplateKeys,
            },
        );

        // 4) OpenAI生成
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const system = `
あなたは、介護保険および障害福祉サービスの実務に精通した
アセスメント作成補助AIです。

入力された資料を根拠として、template_content に含まれる
すべてのシート・すべての行を確認し、
該当する項目へ具体的な情報を反映してください。

重要ルール:
- 出力はJSONのみとし、JSON以外の説明文を出力してはいけません。
- template_contentと同じ階層構造で返してください。
- template_contentにある全sheets・全rowsを出力してください。
- sheets[].keyは入力テンプレートと完全一致させてください。
- rows[].keyは入力テンプレートと完全一致させてください。
- keyを日本語名、ラベル名、別名へ変更してはいけません。
- labelは変更してはいけません。
- inputType、defaultValue、options、unit、placeholder、group、widthは変更してはいけません。
- rows[].checkは"CIRCLE"または"NONE"のどちらかにしてください。

アセスメントへの反映方法:
- 資料全体を確認し、各事実が該当するすべてのアセスメント項目へ反映してください。
- 同じ事実を、関連する複数の項目へ記載して構いません。
- 1つの事実を1つの項目だけに記載して終了してはいけません。
- 各rows[].labelの意味を確認し、その項目に関連する事実が資料内にないか必ず探してください。
- 資料内の情報を単に要約するのではなく、アセスメント票の各項目へ振り分けてください。
- 疾病名だけを記載せず、資料に明記された治療、通院頻度、医療機関、服薬、健康管理、介護サービス、生活上の対応も関連項目へ反映してください。
- サービス利用内容は、現在利用しているサービス、通院支援、訪問介護、入浴介助、送迎、生活支援などの関連項目へ個別に反映してください。
- 本人・家族の希望は、該当するhopeへ反映してください。
- 現状、観察事項、支援内容、留意事項はremarkへ反映してください。

特に見落としてはいけない情報:
- 疾病名、既往歴、合併症
- 定期受診、通院先、通院頻度
- 人工透析、酸素療法、インスリン、経管栄養などの継続的医療
- 服薬、健康管理、血圧管理、食事・水分に関する資料上の指示
- 訪問介護、通所介護、訪問看護、配食、送迎などの利用サービス
- 入浴、排泄、移動、食事、整容、服薬などの介助内容
- 独居、家族支援の有無、緊急連絡先
- 本人・家族が希望する生活
- ケアプランの長期目標、短期目標
- 訪問記録に記載された実際の状態や支援内容

医療情報の反映:
- 資料に「慢性腎不全」「血液透析」「週3回通院」などの記載がある場合は、
  疾病・健康状態だけでなく、治療状況、定期通院、医療機関の利用、
  通院支援、現在利用しているサービスなど、該当するすべての項目へ反映してください。
- 資料に通院頻度が記載されている場合は、その頻度を省略してはいけません。
- 資料に医療機関名が記載されている場合は、該当する医療・通院項目へ記載してください。
- 資料に透析日の疲労、血圧低下、食事制限、水分制限などが明記されている場合は、
  その内容を該当する健康管理・生活上の留意事項へ反映してください。
- 資料に記載されていない症状や制限を、一般的な医学知識だけで追加してはいけません。

根拠に関するルール:
- 資料に明確な根拠がある項目はcheck="CIRCLE"にしてください。
- remarkまたはhopeを記載する場合は、原則としてcheck="CIRCLE"にしてください。
- 資料から直接確認できる事実は、複数の関連項目に反映して構いません。
- 資料に記載されていない具体的な症状、介助量、リスク、本人の状態を創作してはいけません。
- 医学的な診断、将来予測、資料にない因果関係を断定してはいけません。
- 空欄を埋める目的で一般的な介護文を作ってはいけません。
- 資料から読み取れない項目はcheck="NONE", remark="", hope=""としてください。
- 「不明」「記載なし」という文章を大量にremarkへ記載せず、根拠がなければ空欄にしてください。

文章の書き方:
- remarkには、資料から確認できる現状、治療状況、支援内容、観察事項、留意事項を具体的に記載してください。
- hopeには、資料から確認できる本人または家族の希望・要望を記載してください。
- 疾病名だけ、サービス名だけで終わらず、資料にある頻度や支援内容も併記してください。
- 「困難である」「できない」だけで終わらず、資料にある具体的な状況を記載してください。
- 利用者本人、家族、職員の氏名はremarkやhopeに入れないでください。
- 同じ内容を関連する複数項目に記載する場合も、各項目のlabelに合う表現へ調整してください。

radio項目:
- inputType="radio"の行は、資料に明確な根拠がある場合のみ、
  options内に存在するvalueをrows[].valueへ設定してください。
- rows[].valueは、必ず入力テンプレートのoptions内に存在する値を使用してください。
- 判断できない場合は、入力テンプレートのdefaultValueまたはvalueを変更しないでください。

出力前の確認:
1. template_contentの全行を確認したか。
2. 疾病、医療処置、通院、利用サービスを見落としていないか。
3. 同じ根拠を、関連する複数項目へ適切に反映したか。
4. 資料にある頻度、医療機関、具体的な支援内容を省略していないか。
5. 資料にない症状やリスクを創作していないか。
6. key、label、inputType、optionsなどのテンプレート定義を変更していないか。

remark: 資料から確認できる現状、治療状況、支援内容、観察事項、留意点
hope: 資料から確認できる本人・家族の希望、要望
`.trim();
        const user = {
            service_kind: serviceKind,
            materials,
            template_content: templateContent,
            assessed_on:
                assessment.assessed_on ?? null,
            kaipoke_cs_id: kaipokeCsId,

            generation_instruction:
                isElderCareKind(serviceKind)
                    ? "介護保険のアセスメントとして、疾病、継続的医療、定期通院、利用サービス、ADL・IADL、本人の希望を関連する全項目へ振り分けてください。"
                    : "障害福祉のアセスメントとして、障害特性、生活状況、支援内容、本人の希望を関連する全項目へ振り分けてください。",
        };

        console.log("[assessment:auto-generate] calling openai", {
            assessment_id: id,
            materials_chars: materialsChars,
            docs_used: selectedDocs.map((d) => ({ doc_name: d.doc_name, use: d.use, chars: d.text.length })),
            visit_notes_chars: visitNotes.length,
        });

        const resp = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: JSON.stringify(user) },
            ],
        });

        const txt = resp.choices?.[0]?.message?.content ?? "";
        const finishReason = resp.choices?.[0]?.finish_reason ?? null;

        console.log("[assessment:auto-generate] openai raw", {
            assessment_id: id,
            model: resp.model,
            finish_reason: finishReason,
            content_chars: txt.length,
        });

        if (!txt.trim()) throw new Error("OpenAI returned empty content");

        let generatedUnknown: unknown;
        try {
            generatedUnknown = JSON.parse(txt);
        } catch {
            throw new Error("OpenAI response is not valid JSON");
        }

        // ★重要：ここで template にマージして “必ず正しい shape” にする
        const normalized: AssessmentContent = normalizeByTemplate(templateContent, generatedUnknown);

        const filled = countFilled(normalized);

        console.log("[assessment:auto-generate] normalized", {
            assessment_id: id,
            filled_rows: filled,
        });

        const firstRadioRow = normalized.sheets
            .flatMap((sheet) => sheet.rows)
            .find((row) => row.inputType === "radio");

        console.log(
            "[assessment:auto-generate] normalized format check",
            {
                assessment_id: id,
                first_radio_row: firstRadioRow
                    ? {
                        key: firstRadioRow.key,
                        inputType:
                            firstRadioRow.inputType,
                        value:
                            firstRadioRow.value,
                        defaultValue:
                            firstRadioRow.defaultValue,
                        options_count:
                            firstRadioRow.options?.length ??
                            0,
                        group:
                            firstRadioRow.group,
                    }
                    : null,
            },
        );

        // 全部空は弾く（原因調査用metaつき）
        if (filled === 0) {
            return json(
                {
                    ok: false,
                    error: "generated content is empty (no rows filled)",
                    hint: "OpenAIは返答していますが、templateへのマージ結果が0件です。raw_previewとkey/labelを確認してください。",
                    raw_preview: txt.slice(0, 1500),
                    meta: {
                        docs_used: selectedDocs.map((d) => ({ doc_name: d.doc_name, use: d.use, chars: d.text.length })),
                        missing_optional_doc_names: missingOptional,
                        has_meeting_minutes: hasMeetingMinutes,
                        meeting_minutes_chars: meetingMinutes.length,
                        visit_notes_chars: visitNotes.length,
                        materials_chars: materialsChars,
                        model: resp.model,
                        finish_reason: finishReason,
                    },
                },
                422
            );
        }

        // 5) 更新
        const { data: updated, error: uErr } =
            await supabaseAdmin
                .from("assessments_records")
                .update({
                    content: normalized,

                    /*
                     * 自動生成後も、現在のアセスメント種別を維持する。
                     */
                    service_kind: serviceKind,
                })
                .eq("assessment_id", id)
                .select("*")
                .single();

        if (uErr) throw uErr;

        return json({
            ok: true,
            data: updated,
            meta: {
                docs_used: selectedDocs.map((d) => ({ doc_name: d.doc_name, use: d.use, chars: d.text.length })),
                missing_optional_doc_names: missingOptional,
                has_meeting_minutes: hasMeetingMinutes,
                meeting_minutes_chars: meetingMinutes.length,
                shift_range: { from: ymd(fromDate), to: ymd(baseDate) },
                shifts_total: (shifts ?? []).length,
                visit_notes_chars: visitNotes.length,
                materials_chars: materialsChars,
                filled_rows: filled,
                model: resp.model,
                finish_reason: finishReason,
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[assessment:auto-generate] error", msg);
        return json({ ok: false, error: msg }, 500);
    }
}
