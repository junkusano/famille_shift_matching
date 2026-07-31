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

    const generatedRowsWithSheet: GeneratedRowWithSheet[] =
        [];

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
            if (row && typeof row === "object") {
                generatedRowsWithSheet.push({
                    sheetKey,
                    row,
                });
            }
        }
    }

    function normalizeText(value: unknown): string {
        if (typeof value === "string") {
            return value.trim();
        }

        if (
            typeof value === "number" ||
            typeof value === "boolean"
        ) {
            return String(value);
        }

        return "";
    }

    function normalizeRadioValue(
        templateRow: AssessmentRow,
        rawValue: string,
    ): string {
        if (templateRow.inputType !== "radio") {
            return rawValue;
        }

        if (!rawValue) {
            return "";
        }

        const options =
            Array.isArray(templateRow.options)
                ? templateRow.options
                : [];

        /*
         * AIがoptionのvalueを返した場合
         */
        const matchedByValue = options.find(
            (option) =>
                option.value === rawValue,
        );

        if (matchedByValue) {
            return matchedByValue.value;
        }

        /*
         * AIが「要介護1」などlabelを返した場合
         */
        const matchedByLabel = options.find(
            (option) =>
                option.label.trim() ===
                rawValue.trim(),
        );

        if (matchedByLabel) {
            return matchedByLabel.value;
        }

        /*
         * 「1.自立」のようなlabelと
         * 「自立」のような回答を照合する。
         */
        const matchedByPartialLabel =
            options.find((option) => {
                const label =
                    option.label
                        .replace(
                            /^\d+[.．、\s]*/,
                            "",
                        )
                        .trim();

                return (
                    label === rawValue ||
                    label.includes(rawValue) ||
                    rawValue.includes(label)
                );
            });

        if (matchedByPartialLabel) {
            return matchedByPartialLabel.value;
        }

        /*
         * 不正な値をradioへ保存しない。
         */
        return "";
    }

    const merged: AssessmentContent = {
        ...template,

        sheets: template.sheets.map(
            (templateSheet) => ({
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
                            sameSheetKeyMatches.length ===
                                1
                                ? sameSheetKeyMatches[0]
                                    .row
                                : sameSheetLabelMatches.length ===
                                    1
                                    ? sameSheetLabelMatches[0]
                                        .row
                                    : globalKeyMatches.length ===
                                        1
                                        ? globalKeyMatches[0]
                                            .row
                                        : globalLabelMatches.length ===
                                            1
                                            ? globalLabelMatches[0]
                                                .row
                                            : undefined;

                        const rawGeneratedValue =
                            normalizeText(
                                generatedRow?.value,
                            );

                        const rawGeneratedRemark =
                            normalizeText(
                                generatedRow?.remark,
                            );

                        const generatedHope =
                            normalizeText(
                                generatedRow?.hope,
                            );

                        const templateValue =
                            normalizeText(
                                templateRow.value,
                            );

                        const templateRemark =
                            normalizeText(
                                templateRow.remark,
                            );

                        const templateHope =
                            normalizeText(
                                templateRow.hope,
                            );

                        /*
                         * 既存AIレスポンスとの互換処理。
                         *
                         * text、textarea、date、numberで
                         * valueが空かつremarkだけに内容が
                         * 入っている場合は、remarkをvalueへ移す。
                         */
                        const canPromoteRemarkToValue =
                            templateRow.inputType ===
                            "text" ||
                            templateRow.inputType ===
                            "textarea" ||
                            templateRow.inputType ===
                            "date" ||
                            templateRow.inputType ===
                            "number";

                        const rawValueSource =
                            rawGeneratedValue ||
                            (canPromoteRemarkToValue
                                ? rawGeneratedRemark
                                : "");

                        let generatedValue =
                            normalizeRadioValue(
                                templateRow,
                                rawValueSource,
                            );

                        /*
                         * number項目は数値だけを保存する。
                         */
                        if (
                            templateRow.inputType ===
                            "number" &&
                            generatedValue
                        ) {
                            const numberMatch =
                                generatedValue.match(
                                    /-?\d+(?:\.\d+)?/,
                                );

                            generatedValue =
                                numberMatch?.[0] ?? "";
                        }

                        /*
 * AIが回答をremarkへ返した場合は、
 * valueへも反映するが、remarkの内容も残す。
 *
 * 画面上の回答欄とアセスメントコメントの
 * 両方で内容を確認できるようにする。
 */


                        const generatedRemark =
                            rawGeneratedRemark;

                        const value =
                            generatedValue ||
                            templateValue ||
                            templateRow.defaultValue ||
                            "";

                        const remark =
                            generatedRemark ||
                            templateRemark;

                        const hope =
                            generatedHope ||
                            templateHope;

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

                        const hasGeneratedContent =
                            Boolean(
                                generatedValue ||
                                generatedRemark ||
                                generatedHope,
                            );

                        const check:
                            | "NONE"
                            | "CIRCLE" =
                            hasGeneratedContent ||
                                hasSelectedValue
                                ? "CIRCLE"
                                : generatedCheck ??
                                templateRow.check ??
                                "NONE";

                        return {
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

function countFilled(
    content: AssessmentContent,
): number {
    let n = 0;

    for (const sheet of content.sheets) {
        for (const row of sheet.rows) {
            const value =
                trimOrEmpty(row.value);

            const remark =
                trimOrEmpty(row.remark);

            const hope =
                trimOrEmpty(row.hope);

            const hasValue =
                value !== "" &&
                value !== "00";

            if (
                hasValue ||
                remark ||
                hope ||
                row.check === "CIRCLE"
            ) {
                n++;
            }
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

入力された複数の資料を横断的に読み取り、
template_contentに含まれるすべてのシート・すべての行について、
該当する情報を具体的に抽出・統合・要約してください。

【最重要ルール】

- 出力はJSONのみです。
- JSON以外の説明文やMarkdownを出力してはいけません。
- template_contentと同じ階層構造で返してください。
- template_contentにある全sheets・全rowsを出力してください。
- sheets[].keyは入力テンプレートと完全一致させてください。
- rows[].keyは入力テンプレートと完全一致させてください。
- labelは変更してはいけません。
- inputType、defaultValue、options、unit、placeholder、group、widthを変更してはいけません。
- rows[].checkは"CIRCLE"または"NONE"にしてください。

【value・remark・hopeの役割】

value:
- 画面の入力欄へ表示する実際の回答です。
- text、textarea、date、number、radioの回答は必ずvalueへ設定してください。
- 回答をremarkだけに入れてはいけません。

remark:
- 資料間の矛盾
- 採用した情報の根拠
- valueだけでは表現できない補足
- 判断時の注意事項

hope:
- 本人または家族の希望・要望

通常の回答はvalueへ設定してください。
remarkは補足欄であり、回答欄の代わりではありません。

【入力形式別ルール】

inputType="text":
- 抽出した文字列をvalueへ設定してください。

inputType="textarea":
- 複数資料の情報を統合・要約した具体的な文章をvalueへ設定してください。

inputType="date":
- 日付が明確な場合はYYYY-MM-DD形式でvalueへ設定してください。
- 和暦は西暦へ変換してください。

inputType="number":
- 資料に明確な数値がある場合のみ、数値をvalueへ設定してください。

inputType="radio":
- 資料に明確な根拠がある場合のみ、options内に存在するvalueを設定してください。
- labelではなく、options[].valueを設定してください。
- 判断できない場合は、template_contentの現在のvalueまたはdefaultValueを維持してください。
- ADL・認知項目のdefaultValue="01"は、未選択の"00"へ変更してはいけません。
- 車いす使用が判明しても、それだけを理由に「歩行できない」へ変更してはいけません。
- 「歩行不可」「歩けない」「自力歩行困難」などの明確な記載がある場合のみ、歩行項目を変更してください。

【資料の読み取り方】

- 単純な完全一致検索だけで判断してはいけません。
- 複数資料に散在する事実を統合してください。
- 同じ事実を関連する複数項目へ反映して構いません。
- 1つの情報を1つの項目だけに記載して終了してはいけません。
- 各rows[].labelの意味を理解し、関連資料がないか必ず確認してください。
- 資料に明確な根拠がある項目はcheck="CIRCLE"にしてください。
- value、remark、hopeのいずれかを設定する場合は、原則check="CIRCLE"にしてください。
- 資料から判断できないradio項目は、template_contentの現在のvalueまたはdefaultValueを維持してください。
- 特にADL・認知項目のdefaultValue="01"は、未選択の"00"へ変更してはいけません。
- 資料に明確な根拠がある場合のみ、defaultValueを別の選択肢へ変更してください。
- text、textarea、date、number項目は、根拠がない場合は空欄にしてください。

【最重要：文脈からアセスメント項目へ対応付ける】

資料中にアセスメント項目名と同じ単語が書かれているかどうかだけで
振り分けてはいけません。

資料全体の文脈から、利用者の状態、生活動作、支援の必要性、
介助の状況、制限、リスク、本人の希望を理解し、
意味的に対応するアセスメント項目へ反映してください。

例えば、資料に「歩行」という単語がなくても、

- 一人で移動できない
- 外出時に付き添いが必要
- 通院時に送迎を利用する
- 乗車や降車に介助が必要
- 移動時に職員がそばにつく
- 長距離の移動が難しい
- 疲労により移動能力が低下する
- 転倒のおそれがある
- 自宅内で支えが必要

などの記載があれば、内容に応じて次の項目を検討してください。

- mobable07
- lifefunction01_1
- moving_tools_indoor
- moving_tools_outdoor
- move_meal_note
- doctor_opinion_mobility
- risk_and_policy
- safety_necessity
- social_activity
- social_note
- summary

ただし、資料から明確に判断できないradio項目は、
template_contentの現在のvalueまたはdefaultValueを維持してください。

radio項目の選択肢を変更するほどの根拠が弱い場合でも、
移動、歩行、付き添い、送迎、見守り、介助、疲労、転倒リスクなどの
具体的情報は、関連する特記事項のvalueへ記載してください。

特に次の特記事項は、関連情報があれば空欄のままにしないでください。

- bath_note
- move_meal_note
- toilet_clean_cloth_note
- cognition_note
- communication_note
- social_note
- health_special_note
- risk_and_policy
- medical_management_need
- medical_caution
- summary

一つの事実が複数のアセスメント領域に関係する場合は、
各項目の目的に応じて、それぞれ適切な表現で反映してください。

例えば、

「透析通院には送迎と付き添いが必要で、透析後は疲労が強い」

という情報がある場合は、必要に応じて以下へ反映してください。

- current_servicesの該当項目
- move_meal_note
- health_special_note
- medical_management_need
- medical_caution
- risk_and_policy
- social_activity
- summary

単純に一つの項目へ転記して終了してはいけません。

【基本情報】

次の情報は、資料に記載があれば必ず対応するvalueへ設定してください。

- 本人氏名
- 性別
- 年齢
- 生年月日
- 住所
- 電話番号
- 携帯電話番号
- 介護保険被保険者番号
- 要介護度
- 認定日
- 認定有効期間
- 家族情報
- 緊急連絡先
- 生活状況
- 本人の希望
- 家族の希望

利用者本人、家族、担当者の氏名を一律に除外してはいけません。
本人氏名、家族氏名、担当者名など、
テンプレート上で氏名を求める項目には必要な氏名をvalueへ設定してください。

【医療・健康情報】

以下の情報を見落としてはいけません。

- 疾病名
- 既往歴
- 合併症
- 人工透析
- 定期受診
- 通院先
- 通院頻度
- 服薬
- 血圧管理
- 糖尿病管理
- 食事管理
- 水分管理
- 体調変化
- 医療的管理
- サービス提供時の医学的留意事項

例えば資料に、

- 慢性腎不全
- 血液透析
- 週3回通院
- 体調不良になることがある
- 定期的な体調管理が必要

という記載がある場合は、
単に既往歴へ記載するだけではなく、
関連する以下の項目にも資料の範囲内で反映してください。

- medical_history
- health_special_note
- risk_and_policy
- medical_management_need
- medical_caution
- life_function_outlook
- summary

資料にない症状や制限を、
一般的な医学知識だけで追加してはいけません。

【生活状況・支援上の課題】

以下の事実がある場合は、
関連する各項目へ具体的に反映してください。

- 独居
- 配偶者の死亡
- 家族支援が得にくい
- 緊急連絡先がある
- 自宅生活の継続を希望している
- 通院支援が必要
- 入浴介助が必要
- 生活支援が必要
- 手続き支援が必要
- 配食サービスを利用している

例えば、

- 5年前に夫が他界
- 家族からの支援が得られない
- 病気の心配なく自宅生活を続けたい

という情報がある場合は、
以下の関連項目へ適切に要約してください。

- living_situation
- person_hope
- risk_and_policy
- safety_necessity
- rights_protection_necessity
- summary
- social_activity
- social_note

【サービス情報】

資料に記載された次のサービスを、
関連する各項目へ反映してください。

- 訪問介護
- 訪問入浴
- 訪問看護
- 通所介護
- 通所リハビリ
- 通院送迎
- 入浴介助
- 身体介護
- 生活援助
- 配食サービス
- 手続き支援

利用頻度が明確な場合のみ、
number項目のvalueへ月回数または日数を設定してください。

週1回は月4回として機械的に変換せず、
資料の表現を補足説明へ記載するか、
月回数が明確な場合のみnumberへ設定してください。

【総合記述項目】

以下のtextarea項目は、
資料内に関連情報がある場合、
単語だけではなく具体的な文章をvalueへ設定してください。

- summary
- living_situation
- person_hope
- family_hope
- health_special_note
- doctor_opinion_mobility
- doctor_opinion_nutrition
- risk_and_policy
- medical_management_need
- medical_caution
- bath_note
- move_meal_note
- toilet_clean_cloth_note
- cognition_note
- communication_method
- communication_note
- social_activity
- social_note

ただし、医師の意見として明記されていない内容を、
doctor_opinion系項目へ推測で記載してはいけません。

【資料間の矛盾】

資料間に内容の相違がある場合は、
次の優先順位で判断してください。

1. 介護保険証、認定結果、受給者証などの公的資料
2. 日付が新しい資料
3. 居宅サービス計画書、ケアプラン
4. サービス担当者会議録
5. 情報連携資料、看護サマリー
6. その他の文書

判断可能な場合:
- 最も確度が高い内容をvalueへ設定してください。
- 相違内容と採用理由をremarkへ記載してください。

判断できない場合:
- 無理に確定せず、valueは変更しないでください。
- 相違内容をremarkへ記載してください。

【禁止事項】

- 資料にない具体的な介助量を作らないでください。
- 資料にないADL状態を作らないでください。
- 資料にない認知症状を作らないでください。
- 資料にない家族構成を作らないでください。
- 資料にない医学的リスクを断定しないでください。
- 一般的な介護文章だけで空欄を埋めないでください。
- 「不明」「記載なし」を大量にvalueやremarkへ記載しないでください。
- 回答内容をremarkだけに入れないでください。

【出力形式】

template_contentの構造を維持し、
各rowを次の考え方で出力してください。

{
  "key": "テンプレートと完全一致するkey",
  "label": "テンプレートと完全一致するlabel",
  "check": "CIRCLEまたはNONE",
  "value": "画面へ表示する回答",
  "remark": "矛盾・根拠・補足",
  "hope": "本人または家族の希望"
}

出力前に必ず確認してください。

1. text、textarea、date、numberの回答をvalueへ設定したか。
2. 回答をremarkだけに格納していないか。
3. 基本情報をvalueへ設定したか。
4. 疾病、透析、通院頻度、利用サービスを見落としていないか。
5. 同じ根拠を関連する複数項目へ適切に反映したか。
6. 資料にない情報を創作していないか。
7. key、label、inputType、optionsを変更していないか。
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
                    ? `
介護保険のアセスメントとして作成してください。
介護保険のアセスメントとして作成してください。

資料中の文言と項目名の一致だけで判断せず、
資料全体の文脈から利用者の状態を理解してください。

氏名、住所、電話番号、生年月日、要介護度などの基本情報だけでなく、
以下の領域を必ず評価してください。

- ADL
- IADL
- 歩行および移動
- 移乗
- 入浴
- 排泄
- 更衣
- 服薬
- 買い物
- 調理
- 認知
- コミュニケーション
- 医療管理
- 住環境
- 社会活動
- 安全上のリスク
- 本人および家族の希望

資料中の具体的な行動、支援内容、制限、見守り、介助、
付き添い、送迎、疲労、転倒リスクなどを解釈し、
意味的に対応するアセスメント項目へ反映してください。

一つの情報が複数項目に関係する場合は、
最も直接的な項目だけでなく、関連項目にも反映してください。

radio項目は、資料に十分な根拠がある場合のみ変更してください。
根拠が弱い場合は現在のvalueまたはdefaultValueを維持してください。

ただし、radio項目を変更できない場合でも、
関連する具体的な事実や支援上の注意点は、
対応するtextarea項目のvalueへ必ず記載してください。

特に次の項目は、資料に関連情報があれば積極的に記載してください。

- move_meal_note
- bath_note
- toilet_clean_cloth_note
- health_special_note
- risk_and_policy
- medical_management_need
- medical_caution
- social_activity
- social_note
- summary

通常の回答はrows[].valueへ設定してください。

rows[].remarkは、
資料間の矛盾、採用理由、根拠、補足情報に使用してください。
`.trim()
                    : `
障害福祉サービスのアセスメントとして作成してください。

資料全体を読み、
本人の生活状況、希望、価値観、障害特性、生活上の困りごと、
支援内容、社会参加、家族状況を理解してください。

資料中の単語だけで判断せず、
文脈から意味的にアセスメント項目へ対応付けてください。

一つの情報が複数項目に関係する場合は、
関連する複数項目へ反映してください。

評価対象

・本人の希望
・家族の希望
・生活歴
・日中活動
・就労状況
・地域生活
・対人関係
・コミュニケーション
・意思決定
・行動特性
・精神状態
・身体機能
・移動
・食事
・排泄
・清潔保持
・服薬
・金銭管理
・買い物
・余暇活動
・社会参加
・支援上の配慮
・環境調整
・リスク
・今後必要となる支援

資料中の内容は、
単純コピーではなく、
相談支援専門員が作成するアセスメントとして自然な文章へ整理してください。

根拠が不十分な項目は空欄にしてください。

radio項目は十分な根拠がある場合のみ変更してください。

textarea項目には、
利用者の生活像が伝わるよう、
具体的な状況・支援内容・課題・強みを記載してください。

rows[].valueへ通常の回答を設定してください。

rows[].remarkは、
資料間の矛盾、
判断理由、
補足説明のみ記載してください。
`.trim(),
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

        const normalized: AssessmentContent =
            normalizeByTemplate(
                templateContent,
                generatedUnknown,
            );

        const filled = countFilled(normalized);

        const valueFilledRows = normalized.sheets
            .flatMap((sheet) =>
                sheet.rows.map((row) => ({
                    sheet_key: sheet.key,
                    key: row.key,
                    label: row.label,
                    value: trimOrEmpty(row.value),
                    remark: trimOrEmpty(row.remark),
                    hope: trimOrEmpty(row.hope),
                    check: row.check,
                })),
            )
            .filter(
                (row) =>
                    row.value !== "" &&
                    row.value !== "00",
            );

        const remarkOnlyRows = normalized.sheets
            .flatMap((sheet) =>
                sheet.rows.map((row) => ({
                    sheet_key: sheet.key,
                    key: row.key,
                    label: row.label,
                    value: trimOrEmpty(row.value),
                    remark: trimOrEmpty(row.remark),
                    hope: trimOrEmpty(row.hope),
                    check: row.check,
                })),
            )
            .filter(
                (row) =>
                    !row.value &&
                    Boolean(row.remark),
            );

        console.log(
            "[assessment:auto-generate] value/remark check",
            {
                assessment_id: id,

                value_filled_count:
                    valueFilledRows.length,

                value_filled_preview:
                    valueFilledRows.slice(0, 20),

                remark_only_count:
                    remarkOnlyRows.length,

                remark_only_preview:
                    remarkOnlyRows.slice(0, 20),
            },
        );

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
