import "server-only";

import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { ConnectorResult, KnowledgeConnector, NormalizedSourceObject } from "@/lib/knowledge/types";

type FaxCursor = { lastUpdatedAt?: string; lastDocumentId?: string };
type FaxRow = {
  id: string;
  source: string;
  url: string;
  doc_type_id: string | null;
  classification_confidence: number | null;
  created_at: string;
  updated_at: string;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const faxConnector: KnowledgeConnector = {
  key: "fax",

  async testConnection() {
    const { count, error } = await supabaseAdmin.from("cs_docs").select("id", { count: "exact", head: true });
    if (error) throw error;
    return { ok: true, details: { available: true, documentCount: count ?? 0, mode: "metadata_only" } };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const cursor = ctx.cursor as FaxCursor;
    let query = supabaseAdmin
      .from("cs_docs")
      .select("id,source,url,doc_type_id,classification_confidence,created_at,updated_at")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(500);
    if (cursor.lastUpdatedAt) query = query.gte("updated_at", cursor.lastUpdatedAt);
    const { data, error } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as FaxRow[]).filter((row) => {
      if (!cursor.lastUpdatedAt || row.updated_at > cursor.lastUpdatedAt) return true;
      return row.updated_at === cursor.lastUpdatedAt && row.id > (cursor.lastDocumentId ?? "");
    });
    const objects: NormalizedSourceObject[] = rows.map((row) => ({
      externalId: row.id,
      objectType: "fax_document",
      sourceRevision: row.updated_at,
      title: `FAX文書 ${row.id.slice(0, 8)}`,
      sourceUrl: "/portal/cs_docs",
      driveUrl: row.url,
      occurredAt: row.created_at,
      contentHash: hash({ id: row.id, updatedAt: row.updated_at, docTypeId: row.doc_type_id }),
      locator: { csDocsId: row.id },
      metadata: {
        sourceSystem: row.source,
        docTypeId: row.doc_type_id,
        classificationConfidence: row.classification_confidence,
        metadataOnly: true,
      },
      privacyLevel: 3,
      publishability: "never_publish",
      containsPersonalData: true,
    }));
    const last = rows.at(-1);
    return {
      objects,
      proposedKnowledge: [],
      nextCursor: last ? { lastUpdatedAt: last.updated_at, lastDocumentId: last.id } : { ...cursor, lastCheckedAt: new Date().toISOString() },
      hasMore: rows.length >= 500,
      warnings: rows.length >= 500 ? ["FAX差分が500件以上あります。次回同期で続きを取得します。"] : [],
    };
  },
};

