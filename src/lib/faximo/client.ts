//lib/faximo/client.ts
import "server-only";

const FAXIMO_SILVER_SEND_URL = "https://rest.faximo.jp/snd/v2/request.json";
const MAX_DESTINATIONS = 50;
const MAX_TOTAL_REQUEST_BYTES = 40 * 1024 * 1024;
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/;
const SUPPORTED_EXTENSIONS = new Set([
  "pdf", "xls", "xlsx", "xlsm", "doc", "docx",
  "tif", "tiff", "jpg", "jpeg", "jpe", "jfif", "txt", "info",
]);

export type FaximoAttachment = {
  filename: string;
  data: Buffer;
};

export type SendFaximoFaxInput = {
  faxNumbers: string[];
  attachments?: FaximoAttachment[];
  body?: string;
  subject?: string;
  userKey?: string;
  tsi?: string;
  headerInfo?: string;
  retryCount?: 0 | 1 | 2 | 3;
  resultEmail?: string;
  processKey?: string;
};

export type FaximoSendResponse = {
  result: string;
  processkey?: string;
  accepttime?: string;
  idxcnt?: string;
};

export class FaximoApiError extends Error {
  constructor(
    message: string,
    public readonly resultCode?: string,
    public readonly httpStatus?: number,
    public readonly responseBody?: unknown,
  ) {
    super(message);
    this.name = "FaximoApiError";
  }
}

function getRequiredEnv(name: "FAXIMO_LOGIN_ID" | "FAXIMO_LOGIN_PASSWORD"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

function normalizeFaxNumber(value: string): string {
  const normalized = value.replace(/[\s()-]/g, "");
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new Error(`FAX番号はハイフンなし20桁以内の数字で指定してください: ${value}`);
  }
  return normalized;
}

function validateAttachment(attachment: FaximoAttachment): void {
  if (!attachment.filename || attachment.filename.length > 150) {
    throw new Error(`添付ファイル名は1〜150文字で指定してください: ${attachment.filename}`);
  }
  if (INVALID_FILENAME_CHARS.test(attachment.filename)) {
    throw new Error(`添付ファイル名に使用できない文字が含まれています: ${attachment.filename}`);
  }

  const extension = attachment.filename.split(".").pop()?.toLowerCase();
  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`faximoで送信できない拡張子です: ${attachment.filename}`);
  }
  if (attachment.data.length === 0) {
    throw new Error(`添付ファイルが空です: ${attachment.filename}`);
  }
}

function createProcessKey(): string {
  return `fax-${Date.now()}-${crypto.randomUUID()}`.slice(0, 20);
}

export async function sendFaximoFax(input: SendFaximoFaxInput): Promise<FaximoSendResponse> {
  const loginId = getRequiredEnv("FAXIMO_LOGIN_ID");
  const password = getRequiredEnv("FAXIMO_LOGIN_PASSWORD");

  const faxNumbers = [...new Set(input.faxNumbers.map(normalizeFaxNumber))];
  if (faxNumbers.length === 0) throw new Error("FAX送信先を1件以上指定してください");
  if (faxNumbers.length > MAX_DESTINATIONS) {
    throw new Error(`FAX送信先は1リクエスト最大${MAX_DESTINATIONS}件です`);
  }
  if (faxNumbers.length !== input.faxNumbers.length) {
    throw new Error("同一のFAX番号を重複して指定することはできません");
  }

  const attachments = input.attachments ?? [];
  attachments.forEach(validateAttachment);
  if (!input.body?.trim() && attachments.length === 0) {
    throw new Error("本文または添付ファイルのどちらかが必要です");
  }

  if (input.userKey && !/^[\x20-\x7E]{1,255}$/.test(input.userKey)) {
    throw new Error("userKeyは255文字以内の半角英数・記号で指定してください");
  }
  if (input.subject && input.subject.length > 50) {
    throw new Error("件名は50文字以内で指定してください");
  }
  if (input.tsi && input.tsi.length > 20) throw new Error("TSIは20文字以内です");
  if (input.headerInfo && input.headerInfo.length > 80) throw new Error("ヘッダー情報は80文字以内です");
  if (input.resultEmail && input.resultEmail.length > 80) throw new Error("結果通知メールアドレスは80文字以内です");

  const payload = {
    sendto: faxNumbers.map((faxno) => ({ faxno })),
    ...(input.userKey ? { userkey: input.userKey } : {}),
    ...(input.tsi ? { tsi: input.tsi } : {}),
    ...(input.headerInfo ? { headerinfo: input.headerInfo } : {}),
    ...(input.retryCount !== undefined ? { retrynum: String(input.retryCount) } : {}),
    ...(input.resultEmail ? { resaddress: input.resultEmail } : {}),
    ...(input.subject ? { subject: input.subject } : {}),
    body: input.body ?? "",
    ...(attachments.length > 0
      ? {
          Attachment: attachments.map((attachment) => ({
            attachmentname: attachment.filename,
            attachmentdata: attachment.data.toString("base64"),
          })),
        }
      : {}),
  };

  const requestBody = JSON.stringify(payload);
  if (Buffer.byteLength(requestBody, "utf8") > MAX_TOTAL_REQUEST_BYTES) {
    throw new Error("faximo APIのリクエスト上限40MBを超えています");
  }

  const processKey = input.processKey?.trim() || createProcessKey();
  if (processKey.length > 20) throw new Error("processKeyは20文字以内です");

  const response = await fetch(FAXIMO_SILVER_SEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth": Buffer.from(`${loginId}:${password}`, "utf8").toString("base64"),
      "X-Processkey": processKey,
    },
    body: requestBody,
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });

  const rawText = await response.text();
  let responseBody: FaximoSendResponse | undefined;
  try {
    responseBody = rawText ? (JSON.parse(rawText) as FaximoSendResponse) : undefined;
  } catch {
    throw new FaximoApiError(
      "faximoからJSONではない応答が返されました",
      undefined,
      response.status,
      rawText.slice(0, 1000),
    );
  }

  if (!response.ok) {
    throw new FaximoApiError(
      `faximoへの通信に失敗しました（HTTP ${response.status}）`,
      responseBody?.result,
      response.status,
      responseBody,
    );
  }
  if (!responseBody || responseBody.result !== "000000") {
    throw new FaximoApiError(
      `faximoが送信依頼を受け付けませんでした（result=${responseBody?.result ?? "unknown"}）`,
      responseBody?.result,
      response.status,
      responseBody,
    );
  }

  return responseBody;
}
