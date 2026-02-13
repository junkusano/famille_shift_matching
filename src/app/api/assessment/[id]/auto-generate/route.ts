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
    created_at: string; // timestamptz
};

const REQUIRED_DOC_NAMES = [
    "基本情報(ステップ２）",
    "サービス等利用計画",
] as const;

const OPTIONAL_DOC_NAMES = [
    "情報連携・看護サマリー等",
] as const;

function clampText(s: string, max = 18000) {
    const t = (s ?? "").trim();
    if (t.length <= max) return t;
    return t.slice(0, max) + "\n...(truncated)";
}

function isoMinusDays(iso: string, days: number) {
    const d = new Date(iso);
    d.setDate(d.getDate() - days);
    return d.toISOString();
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

        const kaipokeCsId = String(assessment.kaipoke_cs_id ?? "").trim();
        if (!kaipokeCsId) {
            return json({ ok: false, error: "kaipoke_cs_id is empty on assessment record" }, 400);
        }

        const content = assessment.content ?? {};
        const sheets = Array.isArray(content?.sheets) ? content.sheets : [];
        if (!sheets.length) {
            return json({ ok: false, error: "assessment content has no sheets" }, 400);
        }

        // assessment 作成日（これ以前1か月の shift を参照）
        const baseCreatedAt = assessment.created_at ?? new Date().toISOString();
        const oneMonthAgoIso = isoMinusDays(baseCreatedAt, 30);

        // 2) cs_docs 取得（doc_name 3種のみ。揃わない場合は中断）
        const { data: docs, error: dErr } = await supabaseAdmin
            .from("cs_docs")
            .select("id, created_at, kaipoke_cs_id, doc_name, ocr_text, summary")
            .eq("kaipoke_cs_id", kaipokeCsId)
            .in("doc_name", [...REQUIRED_DOC_NAMES, ...OPTIONAL_DOC_NAMES])
            .order("created_at", { ascending: false });

        if (dErr) throw dErr;

        const byName = new Map<string, CsDocRow[]>();
        (docs ?? []).forEach((d: CsDocRow) => {
            const name = d.doc_name ?? "";
            if (!byName.has(name)) byName.set(name, []);
            byName.get(name)!.push(d);
        });

        const missing = REQUIRED_DOC_NAMES.filter((n) => !(byName.get(n)?.length));
        if (missing.length) {
            return json(
                {
                    ok: false,
                    error: "required cs_docs are missing",
                    missing_doc_names: missing,

                    required_doc_names: REQUIRED_DOC_NAMES,
                    optional_doc_names: OPTIONAL_DOC_NAMES,
                    kaipoke_cs_id: kaipokeCsId,
                },
                400
            );
        }

        // 各doc_nameごとに最新1件だけ使う（summary優先、なければocr_text）
        const pickLatest = (name: string) => {
            const list = byName.get(name) ?? [];
            if (!list.length) return null;
            const d = list[0]; // created_at desc の先頭
            const summary = (d.summary ?? "").trim();
            const ocr = (d.ocr_text ?? "").trim();
            const text = summary || ocr;
            if (!text) return null; // 万一両方空ならスキップ
            return {
                id: d.id,
                created_at: d.created_at,
                doc_name: name,
                text,
                use: summary ? "summary" : "ocr_text",
            };
        };

        const selectedDocs = [
            ...REQUIRED_DOC_NAMES.map((n) => pickLatest(n)).filter(Boolean),
            ...OPTIONAL_DOC_NAMES.map((n) => pickLatest(n)).filter(Boolean),
        ] as Array<{ id: string; created_at: string; doc_name: string; text: string; use: "summary" | "ocr_text" }>;

        const missingOptional = OPTIONAL_DOC_NAMES.filter((n) => !(byName.get(n)?.length));

        const docsText = selectedDocs
            .map((d) => {
                return `--- cs_docs: ${d.doc_name} (use=${d.use}) created_at=${d.created_at} id=${d.id} ---\n${d.text}`;
            })
            .join("\n\n");

        // 3) 直近1か月の訪問記録（shift.tokutei_comment）
        const { data: shifts, error: sErr } = await supabaseAdmin
            .from("shift")
            .select("shift_id, shift_start_date, shift_start_time, tokutei_comment, created_at")
            .eq("kaipoke_cs_id", kaipokeCsId)
            // 作成日以前 1か月分（created_at 기준）
            .gte("created_at", oneMonthAgoIso)
            .lte("created_at", baseCreatedAt)
            .order("created_at", { ascending: false })
            .limit(80);

        if (sErr) throw sErr;

        const visitNotes = (shifts ?? [])
            .map((r: ShiftRow) => {
                const t = (r.tokutei_comment ?? "").trim();
                if (!t) return null;
                const dt = r.created_at;
                const d = r.shift_start_date ?? "";
                const tm = r.shift_start_time ?? "";
                return `- ${dt} (shift ${d} ${tm})\n${t}`;
            })
            .filter(Boolean)
            .join("\n\n");

        const materials = clampText(
            [
                "## 必須資料(cs_docs)",
                docsText,
                "",
                "## 直近1か月の訪問記録(shift.tokutei_comment)",
                visitNotes ? visitNotes : "(直近1か月の訪問記録はありません)",
            ].join("\n"),
            22000
        );

        // 4) OpenAI生成
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const system = `
あなたは介護/障害福祉のアセスメント作成補助AIです。
与えられた「必須資料(cs_docsの指定3種)」と「直近1か月の訪問記録」だけを根拠に、アセスメント票の各項目を埋めます。

必須ルール:
- 出力は JSONのみ（コードフェンス禁止、説明禁止）
- 返すJSONは assessment.content と同型: { "sheets":[ ... ], "version": number }
- sheets / rows の key・title・label は変更しない
- rows[].check は "CIRCLE" または "NONE"
- 根拠が薄い場合は check="NONE"、remark/hope は空文字でOK
- 推測で断定しない（資料にある事実を短く反映）
- remark: 現状/観察/留意点、hope: 本人・家族の希望/要望
`.trim();

        const user = {
            materials,
            template_content: content,
            assessed_on: assessment.assessed_on ?? null,
            kaipoke_cs_id: kaipokeCsId,
        };

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
        if (!txt.trim()) throw new Error("OpenAI returned empty content");

        let generated: unknown;
        try {
            generated = JSON.parse(txt);
        } catch {
            throw new Error("OpenAI response is not valid JSON");
        }

        // 5) 更新
        const { data: updated, error: uErr } = await supabaseAdmin
            .from("assessments_records")
            .update({ content: generated })
            .eq("assessment_id", id)
            .select("*")
            .single();

        if (uErr) throw uErr;

        return json({
            ok: true,
            data: updated,
            meta: {
                kaipoke_cs_id: kaipokeCsId,
                base_created_at: baseCreatedAt,
                shift_range: { from: oneMonthAgoIso, to: baseCreatedAt },
                docs_used: selectedDocs.map((d) => ({
                    id: d.id,
                    doc_name: d.doc_name,
                    created_at: d.created_at,
                    use: d.use,
                })),
                missing_optional_doc_names: missingOptional,
                shift_notes_count: (shifts ?? []).filter((r: ShiftRow) => (r.tokutei_comment ?? "").trim().length > 0).length,
                model: resp.model,
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ ok: false, error: msg }, 500);
    }
}
