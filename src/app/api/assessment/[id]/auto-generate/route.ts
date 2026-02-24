// src/app/api/assessment/[id]/auto-generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
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

type AssessmentRow = {
    key: string;
    label: string;
    check: "NONE" | "CIRCLE";
    remark: string;
    hope: string;
};

type AssessmentSheet = {
    key: string;
    title: string;
    printTarget: boolean;
    rows: AssessmentRow[];
};

type AssessmentContent = {
    version: number;
    sheets: AssessmentSheet[];
};

// OpenAIが返してきがちな “不足フィールドあり” JSON を受ける型
type GeneratedRowPartial = {
    key?: unknown;
    check?: unknown;
    remark?: unknown;
    hope?: unknown;
};

type GeneratedSheetPartial = {
    key?: unknown;
    rows?: unknown;
};

type GeneratedContentPartial = {
    version?: unknown;
    sheets?: unknown;
};

const CORE_DOC_NAMES = ["基本情報(ステップ２）", "サービス等利用計画"] as const;
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
            if (typeof row.remark !== "string") return false;
            if (typeof row.hope !== "string") return false;
        }
    }
    return true;
}

// OpenAIの “部分JSON” を読み取り、templateにマージして正規化
function normalizeByTemplate(template: AssessmentContent, generatedUnknown: unknown): AssessmentContent {
    const gen = generatedUnknown as GeneratedContentPartial;

    const genSheets: GeneratedSheetPartial[] = Array.isArray(gen?.sheets) ? (gen.sheets as GeneratedSheetPartial[]) : [];

    // sheetKey -> (rowKey -> {check,remark,hope})
    const rowMap = new Map<string, Map<string, { check?: "NONE" | "CIRCLE"; remark?: string; hope?: string }>>();

    for (const s of genSheets) {
        const sk = typeof s?.key === "string" ? s.key : "";
        if (!sk) continue;

        const rowsUnknown = s?.rows;
        const rows: GeneratedRowPartial[] = Array.isArray(rowsUnknown) ? (rowsUnknown as GeneratedRowPartial[]) : [];

        const rm = new Map<string, { check?: "NONE" | "CIRCLE"; remark?: string; hope?: string }>();
        for (const r of rows) {
            const rk = typeof r?.key === "string" ? (r.key as string) : "";
            if (!rk) continue;

            const check = r.check === "NONE" || r.check === "CIRCLE" ? (r.check as "NONE" | "CIRCLE") : undefined;
            const remark = typeof r.remark === "string" ? r.remark : undefined;
            const hope = typeof r.hope === "string" ? r.hope : undefined;

            rm.set(rk, { check, remark, hope });
        }
        rowMap.set(sk, rm);
    }

    const merged: AssessmentContent = {
        version: template.version,
        sheets: template.sheets.map((ts) => {
            const rm = rowMap.get(ts.key);
            return {
                key: ts.key,
                title: ts.title,
                printTarget: ts.printTarget,
                rows: ts.rows.map((tr) => {
                    const hit = rm?.get(tr.key);
                    const nextCheck = hit?.check ?? tr.check;
                    const nextRemark = typeof hit?.remark === "string" ? hit.remark : tr.remark;
                    const nextHope = typeof hit?.hope === "string" ? hit.hope : tr.hope;

                    return {
                        key: tr.key,
                        label: tr.label,
                        check: nextCheck,
                        remark: nextRemark,
                        hope: nextHope,
                    };
                }),
            };
        }),
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

        const kaipokeCsId = trimOrEmpty(assessment.kaipoke_cs_id);
        if (!kaipokeCsId) return json({ ok: false, error: "kaipoke_cs_id is empty" }, 400);

        const templateUnknown: unknown = assessment.content ?? null;
        if (!isAssessmentContent(templateUnknown)) {
            return json({ ok: false, error: "assessment.content is not valid AssessmentContent" }, 400);
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

        // ★必須条件（緩和）：2つのうちどちらか1つでも “テキストあり” ならOK
        const corePicked: SelectedDoc[] = CORE_DOC_NAMES
            .map((n) => pickLatestByName(n, 12000))
            .filter((x): x is SelectedDoc => x !== null);

        if (corePicked.length === 0) {
            const missingByName = CORE_DOC_NAMES.filter((n) => !(byName.get(n)?.length));
            const emptyTextNames = CORE_DOC_NAMES.filter((n) => (byName.get(n)?.length ? pickLatestByName(n, 10) === null : false));

            return json(
                {
                    ok: false,
                    error: "core cs_docs are missing (need either 基本情報(ステップ２） or サービス等利用計画 with non-empty text)",
                    missing_doc_names: missingByName,
                    empty_text_doc_names: emptyTextNames,
                    core_doc_names: CORE_DOC_NAMES,
                    optional_doc_names: OPTIONAL_DOC_NAMES,
                    kaipoke_cs_id: kaipokeCsId,
                },
                400
            );
        }

        selectedDocs.push(...corePicked);

        const missingOptional = OPTIONAL_DOC_NAMES.filter((n) => !(byName.get(n)?.length));
        for (const name of OPTIONAL_DOC_NAMES) {
            const opt = pickLatestByName(name, 8000);
            if (opt) selectedDocs.push(opt);
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
            "## 必須/任意資料(cs_docs)",
            docsText,
            "",
            "## 直近1か月の訪問記録(shift.tokutei_comment)",
            visitNotes,
        ].join("\n");

        const materialsChars = materials.length;

        console.log("[assessment:auto-generate] start", {
            assessment_id: id,
            kaipoke_cs_id: kaipokeCsId,
            docs_used: selectedDocs.map((d) => d.doc_name),
            missing_optional: missingOptional,
            materials_chars: materialsChars,
            shift_range: { from: ymd(fromDate), to: ymd(baseDate) },
            shifts_total: (shifts ?? []).length,
        });

        // 4) OpenAI生成
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const system = `
あなたは介護/障害福祉のアセスメント作成補助AIです。
与えられた資料（cs_docsと訪問記録）だけを根拠に、アセスメント票の各項目を埋めます。

必須:
- 出力は JSONのみ（説明禁止）
- 返すJSONは template_content と同じ階層構造を目標にする（version/sheets/rows）
- sheets[].key と rows[].key は必ず出力する
- rows[].check は "CIRCLE" または "NONE"
- 根拠がある項目は check="CIRCLE" にし、remark/hope を短く埋める
- 根拠が薄い項目は check="NONE" でもよいが、関連が少しでもあれば remark を短く入れる
- 推測で断定しない（資料にある表現を要約して入れる）
remark: 現状/観察/留意点
hope: 本人・家族の希望/要望
`.trim();

        const user = {
            materials,
            template_content: templateContent,
            assessed_on: assessment.assessed_on ?? null,
            kaipoke_cs_id: kaipokeCsId,
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

        // 全部空は弾く（原因調査用metaつき）
        if (filled === 0) {
            return json(
                {
                    ok: false,
                    error: "generated content is empty (no rows filled)",
                    hint: "資料テキストが薄い/空/切れている可能性があります。metaを確認してください。",
                    meta: {
                        docs_used: selectedDocs.map((d) => ({ doc_name: d.doc_name, use: d.use, chars: d.text.length })),
                        missing_optional_doc_names: missingOptional,
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
        const { data: updated, error: uErr } = await supabaseAdmin
            .from("assessments_records")
            .update({ content: normalized })
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
