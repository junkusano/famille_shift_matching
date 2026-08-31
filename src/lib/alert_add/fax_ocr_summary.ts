import OpenAI from "openai";
import { downloadCsDocPdf, extractTextWithAbbyy } from "@/lib/cs-docs-reprocess";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import { supabaseAdmin } from "@/lib/supabase/service";

type FaxForSummary = {
  id: number;
  fax_number: string;
  file_name: string;
  file_id: string | null;
  received_at: string;
  status: string | null;
};

type PageForSummary = {
  page_number: number;
  ocr_status: string | null;
  suggested_client_name: string | null;
  suggested_doc_type_id: number | null;
};

type OcrRow = {
  fax_page_id: number;
  ocr_text: string | null;
  extracted_client_name: string | null;
  suggested_reason: string | null;
};

type DocumentType = { id: number; name: string };

const NO_CONTENT = "読み取れる内容はなし";

function driveUrl(fileId: string | null): string {
  return fileId ? `https://drive.google.com/open?id=${encodeURIComponent(fileId)}` : NO_CONTENT;
}

function faxUrl(id: number): string {
  return `${getAppBaseUrl()}/cm-portal/fax/${id}`;
}

function clean(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : NO_CONTENT;
}

function extractJson(value: string): Record<string, unknown> | null {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? value;
  try {
    const parsed = JSON.parse(fenced.trim());
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function getString(obj: Record<string, unknown> | null, key: string): string {
  return clean(obj?.[key]);
}

function getNestedString(obj: Record<string, unknown> | null, parent: string, key: string): string {
  const value = obj?.[parent];
  return value && typeof value === "object" ? clean((value as Record<string, unknown>)[key]) : NO_CONTENT;
}

function withHonorific(value: string): string {
  if (value === NO_CONTENT || /様$/.test(value)) return value;
  return `${value}様`;
}

function getConfidence(obj: Record<string, unknown> | null): string {
  const value = obj?.confidence;
  if (typeof value === "number") return `${Math.round(value * 100)}%`;
  return clean(value);
}

async function getOcrText(
  fax: FaxForSummary,
  pages: PageForSummary[],
  accessToken: string,
): Promise<{ text: string; source: string }> {
  const pageIds = pages.map((page) => page.page_number);
  const { data: pageRows } = await supabaseAdmin
    .from("cm_fax_pages")
    .select("id, page_number")
    .eq("fax_received_id", fax.id)
    .in("page_number", pageIds);

  const ids = (pageRows ?? []).map((row) => row.id);
  if (ids.length > 0) {
    const { data: ocrRows } = await supabaseAdmin
      .from("cm_fax_ocr_results")
      .select("fax_page_id, ocr_text, extracted_client_name, suggested_reason")
      .in("fax_page_id", ids);
    const existing = (ocrRows ?? []) as OcrRow[];
    const text = existing
      .map((row) => row.ocr_text?.trim() ?? "")
      .filter(Boolean)
      .join("\n\n");
    if (text) return { text, source: "既存OCR結果" };
  }

  if (!fax.file_id) return { text: "", source: "OCR未取得" };
  const pdf = await downloadCsDocPdf(fax.file_id, accessToken);
  const text = await extractTextWithAbbyy(pdf);
  return { text, source: "ABBYY OCR" };
}

async function generateSummary(
  fax: FaxForSummary,
  pages: PageForSummary[],
  ocrText: string,
  documentTypes: DocumentType[],
): Promise<string> {
  if (!ocrText.trim()) {
    return [
      "【ファミーユFAX受信】",
      `送信元: ${fax.fax_number || NO_CONTENT}`,
      `PDFファイル: ${driveUrl(fax.file_id)}`,
      `▼文書日付: ${NO_CONTENT}`,
      "",
      "▼要約:",
      "【1】送信者情報（事業所名・担当者名）",
      `- 事業所名: ${NO_CONTENT}`,
      `- 担当者名: ${NO_CONTENT}`,
      "【2】利用者情報（氏名（様をつけて）・住所・連絡先など）",
      `- 氏名: ${NO_CONTENT}`,
      `- 住所: ${NO_CONTENT}`,
      `- 連絡先: ${NO_CONTENT}`,
      "【3】依頼内容（依頼された内容・文脈）",
      `- 内容: ${NO_CONTENT}`,
      "【4】ケアプランまたは個別援助計画が含まれる場合",
      `- 本人・家族の希望: ${NO_CONTENT}`,
      `- サービスに至った理由: ${NO_CONTENT}`,
      `- 長期目標・短期目標: ${NO_CONTENT}`,
      `- サービス内容: ${NO_CONTENT}`,
      "【5】基本情報やアセスメント項目が含まれる場合",
      `- 基本情報: ${NO_CONTENT}`,
      `- 疾病・障害の状況: ${NO_CONTENT}`,
      `- 生活状況: ${NO_CONTENT}`,
      `- サービス利用に至るまでの経緯: ${NO_CONTENT}`,
      `- アセスメント: ${NO_CONTENT}`,
      "【6】介護保険証・受給者証・負担割合証",
      `- ${NO_CONTENT}`,
      "【7】提供表",
      `- ${NO_CONTENT}`,
      "",
      "【文書分類（cs_doc）】",
      `判定_id: ${NO_CONTENT}`,
      `判定_label: ${NO_CONTENT}`,
      `確信度: ${NO_CONTENT}`,
      "",
      `▼利用者名（推定）：${NO_CONTENT}`,
      `▼詳細: ${faxUrl(fax.id)}`,
    ].join("\n");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: OPENAI_PROFILES.standard.model,
    messages: [
      {
        role: "system",
        content: [
          "あなたは介護・福祉事業所のFAXを整理する担当者です。",
          "OCR本文だけを根拠に、日本語で指定JSONを返してください。推測で補完せず、情報がない項目は『読み取れる内容はなし』としてください。",
          "指定された全項目を必ず返し、該当しない区分も『読み取れる内容はなし』にしてください。利用者名は読み取れた場合のみ末尾に『様』を付けてください。",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          output_schema: {
            sender_office: "string",
            sender_person: "string",
            client_name: "string",
            client: { address: "string", contact: "string" },
            document_date: "string",
            request_content: "string",
            care_plan: { hope: "string", reason: "string", goals: "string", service: "string" },
            basic_assessment: {
              basic_info: "string",
              disease_disability: "string",
              living_situation: "string",
              service_history: "string",
              assessment: "string",
            },
            insurance_certificates: "string",
            service_table: "string",
            document_type_id: "number|null",
            document_type_label: "string",
            confidence: "string",
          },
          document_types: documentTypes,
          fax: { fax_number: fax.fax_number, file_name: fax.file_name, received_at: fax.received_at },
          pages,
          ocr_text: ocrText.slice(0, 50000),
        }),
      },
    ],
    max_completion_tokens: 4000,
  });

  const parsed = extractJson(response.choices[0]?.message?.content?.trim() ?? "");
  if (!parsed) throw new Error("FAX要約のJSON解析に失敗しました");

  const senderOffice = getString(parsed, "sender_office");
  const senderPerson = getString(parsed, "sender_person");
  const clientName = withHonorific(getString(parsed, "client_name"));
  const docId = parsed.document_type_id == null ? NO_CONTENT : String(parsed.document_type_id);
  return [
    "【ファミーユFAX受信】",
    `送信元:${senderOffice} / 担当者:${senderPerson}`,
    `PDFファイル: ${driveUrl(fax.file_id)}`,
    `▼文書日付: ${getString(parsed, "document_date")}`,
    "",
    "▼要約:",
    "【1】送信者情報（事業所名・担当者名）",
    `- 事業所名: ${senderOffice}`,
    `- 担当者名: ${senderPerson}`,
    "【2】利用者情報（氏名（様をつけて）・住所・連絡先など）",
    `- 氏名: ${clientName}`,
    `- 住所: ${getNestedString(parsed, "client", "address")}`,
    `- 連絡先: ${getNestedString(parsed, "client", "contact")}`,
    "【3】依頼内容（依頼された内容・文脈）",
    `- 内容: ${getString(parsed, "request_content")}`,
    "【4】ケアプランまたは個別援助計画が含まれる場合",
    `- 本人・家族の希望: ${getNestedString(parsed, "care_plan", "hope")}`,
    `- サービスに至った理由: ${getNestedString(parsed, "care_plan", "reason")}`,
    `- 長期目標・短期目標: ${getNestedString(parsed, "care_plan", "goals")}`,
    `- サービス内容: ${getNestedString(parsed, "care_plan", "service")}`,
    "【5】基本情報やアセスメント項目が含まれる場合",
    `- 基本情報: ${getNestedString(parsed, "basic_assessment", "basic_info")}`,
    `- 疾病・障害の状況: ${getNestedString(parsed, "basic_assessment", "disease_disability")}`,
    `- 生活状況: ${getNestedString(parsed, "basic_assessment", "living_situation")}`,
    `- サービス利用に至るまでの経緯: ${getNestedString(parsed, "basic_assessment", "service_history")}`,
    `- アセスメント: ${getNestedString(parsed, "basic_assessment", "assessment")}`,
    "【6】介護保険証・受給者証・負担割合証",
    `- ${getString(parsed, "insurance_certificates")}`,
    "【7】提供表",
    `- ${getString(parsed, "service_table")}`,
    "",
    "【文書分類（cs_doc）】",
    `判定_id: ${docId}`,
    `判定_label: ${getString(parsed, "document_type_label")}`,
    `確信度: ${getConfidence(parsed)}`,
    "",
    `▼利用者名（推定）：${clientName}`,
    `▼連携：利用者情報にリンク ${faxUrl(fax.id)}`,
  ].join("\n");
}

export async function buildFaxOcrSummary(
  fax: FaxForSummary,
  pages: PageForSummary[],
  accessToken: string,
): Promise<string> {
  const { data: types } = await supabaseAdmin
    .from("cm_document_types")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const { text } = await getOcrText(fax, pages, accessToken);
  return generateSummary(fax, pages, text, (types ?? []) as DocumentType[]);
}
