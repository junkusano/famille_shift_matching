import "server-only";

import { createHash } from "crypto";
import { google } from "googleapis";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/service";
import type {
  ConnectorContext,
  ConnectorResult,
  KnowledgeConnector,
  NormalizedSourceObject,
  ProposedKnowledge,
} from "@/lib/knowledge/types";

const configSchema = z.object({
  spreadsheetId: z.string().min(10),
  sheets: z.array(z.object({
    name: z.string().min(1),
    headerRow: z.number().int().min(1).default(1),
  })).min(1),
  mode: z.enum(["thought_log", "rss_index", "lesson_index", "billing_metrics"]),
  maxRows: z.number().int().min(10).max(10_000).default(2_000),
});

type RowHashes = Record<string, Record<string, string>>;

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function sheetRange(name: string, start: number, end: number) {
  return `'${name.replaceAll("'", "''")}'!A${start}:ZZ${end}`;
}

function safeIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function createSheetsClient() {
  const { data, error } = await supabaseAdmin.rpc("read_secret", {
    secret_name: "google_service_account_key",
  });
  if (error || typeof data !== "string") {
    throw new Error("Google Sheets認証情報を取得できませんでした。");
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(data) as Record<string, unknown>;
  } catch {
    throw new Error("Google Sheets認証情報の形式が正しくありません。");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

function makeSourceObject(input: {
  ctx: ConnectorContext;
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
  fields: Record<string, string>;
  contentHash: string;
}): NormalizedSourceObject {
  const { ctx, spreadsheetId, sheetName, rowNumber, fields, contentHash } = input;
  const mode = stringValue(ctx.source.config.mode);
  const title =
    fields["テーマ"] || fields["記事タイトル"] || fields["リマインド怪談"] ||
    fields["Reminder"] || fields["リマインド"] || `${sheetName} ${rowNumber}行`;
  const summary = fields["会話の要約"] || fields["記事要約"] || "";
  const occurredAt = safeIso(fields["日時"] || fields["公開日時"] || fields["取得日時"] || "");
  const privacyLevel = ctx.source.default_privacy_level;
  const containsPersonalData = mode === "lesson_index" || privacyLevel === 3;
  const safeExcerpt = privacyLevel <= 1 && summary ? summary.slice(0, 1_000) : undefined;

  return {
    externalId: `${sheetName}:${rowNumber}`,
    objectType: mode === "rss_index" ? "sheet_article" : mode === "thought_log" ? "sheet_thought" : mode === "lesson_index" ? "sheet_lesson" : "sheet_metric_range",
    sourceRevision: contentHash,
    title: containsPersonalData ? `${sheetName} ${rowNumber}行` : title.slice(0, 500),
    safeExcerpt,
    sourceUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    occurredAt,
    contentHash,
    locator: { spreadsheetId, sheetName, rowNumber },
    metadata: {
      category: fields["カテゴリ"] || fields["Category"] || null,
      hasSourceUrl: Boolean(fields["URL"]),
      mode,
    },
    privacyLevel,
    publishability: ctx.source.default_publishability,
    containsPersonalData,
  };
}

function makeKnowledge(
  ctx: ConnectorContext,
  spreadsheetId: string,
  sheetName: string,
  rowNumber: number,
  fields: Record<string, string>,
  sourceObject: NormalizedSourceObject
): ProposedKnowledge | null {
  if (ctx.source.config.mode !== "thought_log") return null;
  const summary = fields["会話の要約"] || fields["草野の考え・主張"];
  if (!summary) return null;

  const title = fields["テーマ"] || `思考ログ ${rowNumber}行`;
  const tags = (fields["キーワード"] || "")
    .split(/[、,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 30);

  return {
    knowledgeKey: `sheet:${spreadsheetId}:${sheetName}:${rowNumber}`,
    knowledgeType: fields["草野の考え・主張"] ? "opinion" : "fact",
    title: title.slice(0, 500),
    summary: summary.slice(0, 20_000),
    content: [fields["草野の考え・主張"], fields["背景・問題意識"]]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 20_000) || undefined,
    sourceUrl: sourceObject.sourceUrl,
    occurredAt: sourceObject.occurredAt,
    category: fields["カテゴリ"] || ctx.source.default_category || undefined,
    tags,
    importance: fields["記事化候補"] ? 4 : 3,
    confidence: 1,
    privacyLevel: ctx.source.default_privacy_level,
    publishability: ctx.source.default_publishability,
    authorship: "source",
    evidenceExternalIds: [sourceObject.externalId],
    metadata: { spreadsheetId, sheetName, rowNumber },
  };
}

export const googleSheetsConnector: KnowledgeConnector = {
  key: "google_sheets",

  async testConnection(ctx) {
    const config = configSchema.parse(ctx.source.config);
    const sheets = await createSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.spreadsheetId,
      fields: "spreadsheetId,properties.title,sheets.properties(title,sheetId)",
    });
    return {
      ok: true,
      details: {
        spreadsheetId: response.data.spreadsheetId,
        title: response.data.properties?.title ?? null,
        sheets: (response.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean),
      },
    };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const config = configSchema.parse(ctx.source.config);
    const sheets = await createSheetsClient();
    const previousHashes = (ctx.cursor.rowHashes ?? {}) as RowHashes;
    const nextHashes: RowHashes = {};
    const objects: NormalizedSourceObject[] = [];
    const proposedKnowledge: ProposedKnowledge[] = [];
    const lastRows: Record<string, number> = {};

    for (const sheetConfig of config.sheets) {
      if (ctx.signal.aborted) throw new Error("同期がタイムアウトしました。");
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: sheetRange(sheetConfig.name, sheetConfig.headerRow, config.maxRows),
        majorDimension: "ROWS",
      });
      const rows = response.data.values ?? [];
      const headers = (rows[0] ?? []).map(stringValue);
      nextHashes[sheetConfig.name] = {};
      lastRows[sheetConfig.name] = Math.max(sheetConfig.headerRow, sheetConfig.headerRow + rows.length - 1);

      for (let index = 1; index < rows.length; index += 1) {
        const row = rows[index] ?? [];
        if (!row.some((cell) => stringValue(cell))) continue;
        const rowNumber = sheetConfig.headerRow + index;
        const fields: Record<string, string> = {};
        headers.forEach((header, column) => {
          if (header) fields[header] = stringValue(row[column]);
        });
        const contentHash = hash({ headers, row });
        nextHashes[sheetConfig.name][String(rowNumber)] = contentHash;
        if (previousHashes[sheetConfig.name]?.[String(rowNumber)] === contentHash) continue;

        const object = makeSourceObject({
          ctx,
          spreadsheetId: config.spreadsheetId,
          sheetName: sheetConfig.name,
          rowNumber,
          fields,
          contentHash,
        });
        objects.push(object);
        const knowledge = makeKnowledge(
          ctx,
          config.spreadsheetId,
          sheetConfig.name,
          rowNumber,
          fields,
          object
        );
        if (knowledge) proposedKnowledge.push(knowledge);
      }
    }

    return {
      objects,
      proposedKnowledge,
      nextCursor: {
        spreadsheetId: config.spreadsheetId,
        lastRows,
        rowHashes: nextHashes,
        lastCheckedAt: new Date().toISOString(),
      },
      hasMore: false,
      warnings: [],
    };
  },
};

