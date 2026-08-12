import { createHash } from "crypto";
import OpenAI from "openai";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import { supabaseAdmin } from "@/lib/supabase/service";

export const BASIC_INFO_DOC_TYPE_ID = "ac26b258-4f92-4c9f-91d3-0f0c238541ba";
export const BASIC_INFO_DOC_NAME = "基本情報(ステップ２）";

export type CandidateConfidence = "high" | "medium" | "low";
export type CandidateSource = "ocr" | "summary" | "both" | null;

export type CandidateField = {
  value: string | null;
  confidence: CandidateConfidence;
  source: CandidateSource;
};

export type KaipokeOnboardingCandidate = {
  name: { last: CandidateField; first: CandidateField };
  name_kana: { last: CandidateField; first: CandidateField };
  gender: CandidateField;
  birth_date: CandidateField;
  postal_code: CandidateField;
  prefecture: CandidateField;
  city: CandidateField;
  address: CandidateField;
  building: CandidateField;
  tel: CandidateField;
  mobile: CandidateField;
  remarks: CandidateField;
};

type CsDocForOnboarding = {
  id: string;
  url: string;
  doc_name: string | null;
  doc_type_id: string | null;
  ocr_text: string | null;
  summary: string | null;
  meta: unknown;
  created_at: string;
};

type CachedCandidate = {
  version: 1;
  source_hash: string;
  candidate: KaipokeOnboardingCandidate;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nullableText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function digitsOnly(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const digits = value.normalize("NFKC").replace(/[^0-9]/g, "").slice(0, maxLength);
  return digits || null;
}

function normalizeField(value: unknown, maxLength = 1000): CandidateField {
  const record = asRecord(value);
  const confidence = record?.confidence;
  const source = record?.source;

  return {
    value: nullableText(record?.value, maxLength),
    confidence:
      confidence === "high" || confidence === "medium" || confidence === "low"
        ? confidence
        : "low",
    source:
      source === "ocr" || source === "summary" || source === "both"
        ? source
        : null,
  };
}

function normalizeCandidate(value: unknown): KaipokeOnboardingCandidate {
  const root = asRecord(value);
  const name = asRecord(root?.name);
  const nameKana = asRecord(root?.name_kana);

  const candidate = {
    name: {
      last: normalizeField(name?.last, 100),
      first: normalizeField(name?.first, 100),
    },
    name_kana: {
      last: normalizeField(nameKana?.last, 100),
      first: normalizeField(nameKana?.first, 100),
    },
    gender: normalizeField(root?.gender, 20),
    birth_date: normalizeField(root?.birth_date, 50),
    postal_code: normalizeField(root?.postal_code, 20),
    prefecture: normalizeField(root?.prefecture, 20),
    city: normalizeField(root?.city, 100),
    address: normalizeField(root?.address, 300),
    building: normalizeField(root?.building, 200),
    tel: normalizeField(root?.tel, 50),
    mobile: normalizeField(root?.mobile, 50),
    remarks: normalizeField(root?.remarks, 1000),
  };
  candidate.postal_code.value = digitsOnly(candidate.postal_code.value, 7);
  candidate.tel.value = digitsOnly(candidate.tel.value, 20);
  candidate.mobile.value = digitsOnly(candidate.mobile.value, 20);
  return candidate;
}

export function extractGoogleDriveFileId(url: string): string | null {
  const pathMatch = url.match(/\/file\/d\/([^/?#]+)/);
  if (pathMatch?.[1]) return pathMatch[1];

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id")?.trim() || null;
  } catch {
    return null;
  }
}

export function toGoogleDrivePreviewUrl(url: string): string | null {
  const fileId = extractGoogleDriveFileId(url);
  return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : null;
}

function sourceHash(ocrText: string, summary: string): string {
  return createHash("sha256").update(ocrText).update("\n---SUMMARY---\n").update(summary).digest("hex");
}

function readCache(meta: unknown, hash: string): KaipokeOnboardingCandidate | null {
  const cached = asRecord(asRecord(meta)?.onboarding_candidate) as CachedCandidate | null;
  if (cached?.version !== 1 || cached.source_hash !== hash) return null;
  return normalizeCandidate(cached.candidate);
}

function buildPrompt(ocrText: string, summary: string): string {
  return [
    "次の基本情報資料から、カイポケ新規利用者登録候補を抽出してください。",
    "OCR本文とsummaryの両方を必ず確認してください。",
    "資料に明記されていない内容は推測せず、valueをnullにしてください。",
    "郵便番号は資料に明記された数字だけを7桁で抽出し、〒やハイフンは含めないでください。住所だけから郵便番号を推測してはいけません。",
    "電話番号・携帯電話番号は数字だけを抽出し、ハイフン・空白・括弧は含めないでください。",
    "氏名、住所、電話等の専用欄に入る情報をremarksへ重複させないでください。",
    "remarksは確認できる項目だけを【関係機関】【家族・キーパーソン】【疾病・状態】【予定サービス】【相談経緯・困りごと】【支援上の重要事項】等で整理してください。",
    "空の見出しは書かず、最大1000文字、目安400～700文字にしてください。",
    "confidenceはhigh/medium/low、sourceはocr/summary/both/nullのいずれかです。",
    "出力は指定JSONだけにしてください。",
    "",
    "JSON形式:",
    JSON.stringify({
      name: { last: { value: null, confidence: "low", source: null }, first: { value: null, confidence: "low", source: null } },
      name_kana: { last: { value: null, confidence: "low", source: null }, first: { value: null, confidence: "low", source: null } },
      gender: { value: null, confidence: "low", source: null },
      birth_date: { value: null, confidence: "low", source: null },
      postal_code: { value: null, confidence: "low", source: null },
      prefecture: { value: null, confidence: "low", source: null },
      city: { value: null, confidence: "low", source: null },
      address: { value: null, confidence: "low", source: null },
      building: { value: null, confidence: "low", source: null },
      tel: { value: null, confidence: "low", source: null },
      mobile: { value: null, confidence: "low", source: null },
      remarks: { value: null, confidence: "low", source: null },
    }),
    "",
    "--- OCR本文 ---",
    ocrText.slice(0, 60000),
    "",
    "--- summary ---",
    summary.slice(0, 10000),
  ].join("\n");
}

async function generateCandidate(ocrText: string, summary: string): Promise<KaipokeOnboardingCandidate> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: OPENAI_PROFILES.standard.model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "あなたは介護・障害福祉の基本情報資料を、推測せず転記候補へ構造化する担当者です。",
      },
      { role: "user", content: buildPrompt(ocrText, summary) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return normalizeCandidate(JSON.parse(content));
}

export async function getBasicInfoDocuments() {
  const { data, error } = await supabaseAdmin
    .from("cs_docs")
    .select("id,url,doc_name,doc_type_id,summary,created_at,kaipoke_cs_id,cs_kaipoke_info_id")
    .or(`doc_type_id.eq.${BASIC_INFO_DOC_TYPE_ID},doc_name.eq.${BASIC_INFO_DOC_NAME}`)
    .is("kaipoke_cs_id", null)
    .is("cs_kaipoke_info_id", null)
    .not("ocr_text", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []).map((doc) => ({
    id: doc.id,
    doc_name: doc.doc_name,
    created_at: doc.created_at,
    drive_file_id: extractGoogleDriveFileId(doc.url),
    summary_excerpt: nullableText(doc.summary, 160),
  }));
}

export async function getOnboardingDocument(id: string) {
  const { data, error } = await supabaseAdmin
    .from("cs_docs")
    .select("id,url,doc_name,doc_type_id,ocr_text,summary,meta,created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const doc = data as CsDocForOnboarding;
  if (doc.doc_type_id !== BASIC_INFO_DOC_TYPE_ID && doc.doc_name !== BASIC_INFO_DOC_NAME) {
    throw new Error("The selected document is not a basic information document");
  }

  const ocrText = doc.ocr_text?.trim() ?? "";
  const summary = doc.summary?.trim() ?? "";
  if (!ocrText) throw new Error("OCR text is empty");

  const hash = sourceHash(ocrText, summary);
  let candidate = readCache(doc.meta, hash);

  if (!candidate) {
    candidate = await generateCandidate(ocrText, summary);
    const currentMeta = asRecord(doc.meta) ?? {};
    const cache: CachedCandidate = { version: 1, source_hash: hash, candidate };
    const { error: cacheError } = await supabaseAdmin
      .from("cs_docs")
      .update({ meta: { ...currentMeta, onboarding_candidate: cache } })
      .eq("id", doc.id);
    if (cacheError) console.warn("[rpa/onboarding] candidate cache failed", { code: cacheError.code });
  }

  return {
    id: doc.id,
    doc_name: doc.doc_name,
    created_at: doc.created_at,
    drive_file_id: extractGoogleDriveFileId(doc.url),
    preview_url: toGoogleDrivePreviewUrl(doc.url),
    summary,
    candidate,
  };
}
