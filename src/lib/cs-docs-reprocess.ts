import "server-only";

import OpenAI from "openai";
import { downloadGoogleDriveFile } from "@/lib/google-drive/upload";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import { supabaseAdmin } from "@/lib/supabase/service";

const MAX_ABBYY_POLLS = 30;
const ABBYY_POLL_INTERVAL_MS = 3_000;

type AbbyyTask = {
  id: string;
  status: string;
  resultUrl: string | null;
  error: string | null;
};

function extractDriveFileId(url: string): string | null {
  const queryMatch = url.match(/[?&]id=([^&]+)/);
  if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]);
  return url.match(/\/file\/d\/([^/]+)/)?.[1] ?? null;
}

function parseTask(xml: string): AbbyyTask {
  const taskTag = xml.match(/<task\b([^>]*)\/?\s*>/i)?.[1];
  if (!taskTag) throw new Error("ABBYY応答にtask情報がありません");

  const readAttribute = (name: string) => {
    const value = taskTag.match(new RegExp(`${name}=["']([^"']*)["']`, "i"))?.[1];
    return value
      ? value
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
      : null;
  };
  const id = readAttribute("id") ?? "";
  const status = readAttribute("status") ?? "";
  if (!id || !status) throw new Error("ABBYY応答のtask情報が不正です");

  return {
    id,
    status,
    resultUrl: readAttribute("resultUrl"),
    error: readAttribute("error"),
  };
}

function getAbbyyConfig() {
  const applicationId = process.env.ABBYY_APPLICATION_ID?.trim() ?? "";
  const apiKey = process.env.ABBY_API_KEY?.trim() || process.env.ABBYY_API_KEY?.trim() || "";
  const endpoint = process.env.ABBYY_END_POINT?.trim().replace(/\/$/, "") ?? "";
  if (!applicationId || !apiKey || !endpoint) {
    throw new Error(
      "ABBYY設定（ABBYY_APPLICATION_ID / ABBY_API_KEY / ABBYY_END_POINT）が不足しています",
    );
  }

  const processUrl = endpoint.endsWith("/processImage") ? endpoint : `${endpoint}/processImage`;
  return {
    processUrl,
    statusUrl: new URL("getTaskStatus", processUrl).toString(),
    authorization: `Basic ${Buffer.from(`${applicationId}:${apiKey}`).toString("base64")}`,
  };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function abbyyError(response: Response): Promise<Error> {
  const body = await response.text();
  if (response.status === 450 || /Exceeded quota|NotEnoughCredits/i.test(body)) {
    return new Error("ABBYY OCRの残高が不足しています");
  }
  if (response.status === 401) {
    return new Error("ABBYYのApplication IDまたはAPI Keyが不正です");
  }
  return new Error(`ABBYY OCRエラー HTTP ${response.status}: ${body.slice(0, 300)}`);
}

async function extractTextWithAbbyy(pdf: Buffer): Promise<string> {
  const config = getAbbyyConfig();
  const form = new FormData();
  form.set("language", "japanese");
  form.set("exportFormat", "txt");
  form.set("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "input.pdf");

  const submitted = await fetch(config.processUrl, {
    method: "POST",
    headers: { Authorization: config.authorization },
    body: form,
    cache: "no-store",
  });
  if (!submitted.ok) throw await abbyyError(submitted);

  let task = parseTask(await submitted.text());
  for (let poll = 0; poll < MAX_ABBYY_POLLS && task.status !== "Completed"; poll += 1) {
    if (["ProcessingFailed", "Deleted", "NotEnoughCredits"].includes(task.status)) {
      throw new Error(`ABBYY OCR処理失敗 status=${task.status}${task.error ? `: ${task.error}` : ""}`);
    }

    await wait(ABBYY_POLL_INTERVAL_MS);
    const statusResponse = await fetch(
      `${config.statusUrl}?taskId=${encodeURIComponent(task.id)}`,
      { headers: { Authorization: config.authorization }, cache: "no-store" },
    );
    if (!statusResponse.ok) throw await abbyyError(statusResponse);
    task = parseTask(await statusResponse.text());
  }

  if (task.status !== "Completed" || !task.resultUrl) {
    throw new Error("ABBYY OCRが制限時間内に完了しませんでした");
  }

  const result = await fetch(task.resultUrl, { cache: "no-store" });
  if (!result.ok) throw new Error(`ABBYY OCR結果の取得に失敗しました HTTP ${result.status}`);

  return (await result.text())
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getCsDoc(id: string) {
  const { data, error } = await supabaseAdmin
    .from("cs_docs")
    .select("id,url,ocr_text,doc_name")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("cs_docsの対象文書が見つかりません");
  return data;
}

export async function rerunCsDocOcr(id: string): Promise<string> {
  const doc = await getCsDoc(id);
  const fileId = extractDriveFileId(doc.url);
  if (!fileId) throw new Error("Google DriveファイルIDをURLから取得できません");

  const ocrText = await extractTextWithAbbyy(await downloadGoogleDriveFile(fileId));
  if (!ocrText) throw new Error("ABBYY OCRの結果が空です");

  const { error } = await supabaseAdmin.from("cs_docs").update({ ocr_text: ocrText }).eq("id", id);
  if (error) throw error;
  return ocrText;
}

export async function rerunCsDocSummary(id: string, draftOcrText?: string): Promise<string> {
  const doc = await getCsDoc(id);
  const ocrText = draftOcrText?.trim() || doc.ocr_text?.trim() || "";
  if (!ocrText) throw new Error("サマリー生成に必要なOCR本文がありません");

  const { data: masters, error: masterError } = await supabaseAdmin
    .from("user_doc_master")
    .select("id,label,category,judge_logics")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (masterError) throw masterError;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: OPENAI_PROFILES.standard.model,
    messages: [
      {
        role: "system",
        content: "あなたは介護・障害福祉文書の受信書類を要約する専門AIです。原文にない事実を補わないでください。",
      },
      {
        role: "user",
        content: [
          "以下のOCR本文を日本語で構造的に要約してください。",
          "送信者情報、利用者情報、依頼内容、本人・家族の希望、長期・短期目標と期間、サービス内容、生活・疾病・ADL、証書の有効期間と負担割合を、記載がある範囲で整理してください。",
          "末尾に【文書分類（cs_doc）】として、optionsから必ず1件のIDとlabelを完全一致で記載してください。",
          `options:\n${JSON.stringify(masters ?? [])}`,
          `現在の文書名: ${doc.doc_name ?? "(未設定)"}`,
          `OCR本文:\n${ocrText.slice(0, 50_000)}`,
        ].join("\n\n"),
      },
    ],
    max_completion_tokens: 4_000,
  });

  const summary = response.choices[0]?.message?.content?.trim() ?? "";
  if (!summary) throw new Error("サマリー生成結果が空です");

  const { error } = await supabaseAdmin.from("cs_docs").update({ summary }).eq("id", id);
  if (error) throw error;
  return summary;
}
