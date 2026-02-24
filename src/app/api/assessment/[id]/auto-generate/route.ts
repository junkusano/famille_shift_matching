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

const REQUIRED_DOC_NAMES = ["基本情報(ステップ２）", "サービス等利用計画"] as const;
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

function pickText(row: CsDocRow, maxOcr: number) {
  const summary = trimOrEmpty(row.summary);
  const ocr = trimOrEmpty(row.ocr_text);
  if (summary) return { text: summary, use: "summary" as const };
  if (ocr) return { text: take(ocr, maxOcr), use: "ocr_text" as const };
  return { text: "", use: "none" as const };
}

function countFilled(content) {
  let n = 0;
  for (const s of content?.sheets ?? []) {
    for (const r of s?.rows ?? []) {
      const remark = trimOrEmpty(r?.remark);
      const hope = trimOrEmpty(r?.hope);
      const check = r?.check;
      if (remark || hope || check === "CIRCLE") n++;
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

    const templateContent = assessment.content ?? {};
    if (!Array.isArray(templateContent?.sheets) || templateContent.sheets.length === 0) {
      return json({ ok: false, error: "assessment content has no sheets" }, 400);
    }

    const baseCreatedAtIso = assessment.created_at ?? new Date().toISOString();
    const baseDate = new Date(baseCreatedAtIso);
    const fromDate = new Date(baseDate);
    fromDate.setDate(fromDate.getDate() - 30);

    // 2) cs_docs 取得（必須2+任意）
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

    // 必須：存在チェック（doc_name）
    const missingByName = REQUIRED_DOC_NAMES.filter((n) => !(byName.get(n)?.length));
    if (missingByName.length) {
      return json(
        {
          ok: false,
          error: "required cs_docs are missing",
          missing_doc_names: missingByName,
          required_doc_names: REQUIRED_DOC_NAMES,
          optional_doc_names: OPTIONAL_DOC_NAMES,
          kaipoke_cs_id: kaipokeCsId,
        },
        400
      );
    }

    // 文字が空の必須資料は「不足」扱いにする
    const selectedDocs: Array<{ id: string; created_at: string; doc_name: string; use: string; text: string }> = [];

    const reqEmpty: string[] = [];
    for (const name of REQUIRED_DOC_NAMES) {
      const latest = byName.get(name)![0];
      const picked = pickText(latest, 7000);
      if (!picked.text) reqEmpty.push(name);
      else {
        selectedDocs.push({
          id: latest.id,
          created_at: latest.created_at,
          doc_name: name,
          use: picked.use,
          text: picked.text,
        });
      }
    }
    if (reqEmpty.length) {
      return json(
        {
          ok: false,
          error: "required cs_docs exist but text is empty (summary/ocr_text)",
          missing_doc_names: reqEmpty,
          note: "summary/ocr_text が空です。OCR/要約生成が完了しているか確認してください。",
          kaipoke_cs_id: kaipokeCsId,
        },
        400
      );
    }

    const missingOptional = OPTIONAL_DOC_NAMES.filter((n) => !(byName.get(n)?.length));
    for (const name of OPTIONAL_DOC_NAMES) {
      const latest = byName.get(name)?.[0];
      if (!latest) continue;
      const picked = pickText(latest, 4000);
      if (!picked.text) continue;
      selectedDocs.push({
        id: latest.id,
        created_at: latest.created_at,
        doc_name: name,
        use: picked.use,
        text: picked.text,
      });
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
      .limit(80);

    if (sErr) throw sErr;

    const visitNotesRaw = (shifts ?? [])
      .map((r: ShiftRow) => {
        const t = trimOrEmpty(r.tokutei_comment);
        if (!t) return null;
        const d = r.shift_start_date ?? "";
        const tm = r.shift_start_time ?? "";
        return `- ${d} ${tm} (shift_id=${r.shift_id})\n${t}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const visitNotes = visitNotesRaw ? take(visitNotesRaw, 7000) : "(直近1か月の訪問記録はありません)";

    const materials = [
      "## 必須/任意資料(cs_docs)",
      docsText,
      "",
      "## 直近1か月の訪問記録(shift.tokutei_comment)",
      visitNotes,
    ].join("\n");

    const materialsChars = materials.length;

    // ログ（ここが出ないなら、このroute自体が呼ばれてない）
    console.log("[assessment:auto-generate] start", {
      assessment_id: id,
      kaipoke_cs_id: kaipokeCsId,
      docs_used: selectedDocs.map((d) => d.doc_name),
      missing_optional: missingOptional,
      materials_chars: materialsChars,
    });

    // 4) OpenAI生成
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = `
あなたは介護/障害福祉のアセスメント作成補助AIです。
与えられた資料（cs_docsと訪問記録）だけを根拠に、アセスメント票の各項目を埋めます。

必須:
- 出力は JSONのみ（説明禁止）
- 返すJSONは template_content と同型: { "version": number, "sheets":[...] }
- sheets/rows の key,title,label は変更しない
- rows[].check は "CIRCLE" または "NONE"
- 該当根拠が資料内にある項目は check="CIRCLE" にし、remark/hope を短く埋める
- 根拠が薄い項目は check="NONE"、remark/hope は空でもよい
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

    let generated;
    try {
      generated = JSON.parse(txt);
    } catch {
      throw new Error("OpenAI response is not valid JSON");
    }

    const filled = countFilled(generated);

    console.log("[assessment:auto-generate] openai done", {
      assessment_id: id,
      model: resp.model,
      filled_rows: filled,
      response_chars: txt.length,
    });

    // ★ここ重要：全部空なら “成功扱いにしない”
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
          },
        },
        422
      );
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
        docs_used: selectedDocs.map((d) => ({ doc_name: d.doc_name, use: d.use, chars: d.text.length })),
        missing_optional_doc_names: missingOptional,
        shift_range: { from: ymd(fromDate), to: ymd(baseDate) },
        visit_notes_chars: visitNotes.length,
        materials_chars: materialsChars,
        filled_rows: filled,
        model: resp.model,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[assessment:auto-generate] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}
