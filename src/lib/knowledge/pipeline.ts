import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import { getKnowledgeConnector } from "@/lib/knowledge/connectors/registry";
import { calculateNextRunAt } from "@/lib/knowledge/scheduling";
import { secureProposedKnowledge, secureSourceObject } from "@/lib/knowledge/privacy";
import type {
  KnowledgeItem,
  KnowledgeRunResult,
  KnowledgeSource,
  KnowledgeSyncJobType,
  NormalizedSourceObject,
  ProposedKnowledge,
} from "@/lib/knowledge/types";

type RunOptions = {
  sourceId: string;
  jobType: KnowledgeSyncJobType;
  triggerType: "cron" | "manual" | "system";
  actorAuthUserId?: string;
};

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "同期に失敗しました。";
  if (/token|secret|authorization|credential/i.test(message)) {
    return { code: "CONNECTION_FAILED", message: "外部サービスの認証または接続に失敗しました。" };
  }
  return { code: "SYNC_FAILED", message: message.slice(0, 1_000) };
}

async function persistSourceObject(source: KnowledgeSource, object: NormalizedSourceObject) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("knowledge_source_objects")
    .select("id,source_revision,content_hash")
    .eq("source_id", source.id)
    .eq("external_id", object.externalId)
    .eq("is_current", true)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing?.source_revision === object.sourceRevision && existing.content_hash === object.contentHash) {
    await supabaseAdmin
      .from("knowledge_source_objects")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { id: existing.id as string, action: "skipped" as const };
  }

  if (existing) {
    const { error } = await supabaseAdmin
      .from("knowledge_source_objects")
      .update({ is_current: false })
      .eq("id", existing.id);
    if (error) throw error;
  }

  const row = {
    source_id: source.id,
    external_id: object.externalId,
    object_type: object.objectType,
    source_revision: object.sourceRevision,
    title: object.title ?? null,
    safe_excerpt: object.safeExcerpt ?? null,
    source_url: object.sourceUrl ?? null,
    drive_url: object.driveUrl ?? null,
    occurred_at: object.occurredAt ?? null,
    period_start: object.periodStart ?? null,
    period_end: object.periodEnd ?? null,
    content_hash: object.contentHash,
    locator: object.locator,
    metadata: object.metadata,
    privacy_level: object.privacyLevel,
    publishability: object.publishability,
    contains_personal_data: object.containsPersonalData,
    supersedes_id: existing?.id ?? null,
    is_current: true,
  };
  const { data, error } = await supabaseAdmin
    .from("knowledge_source_objects")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    if (existing) {
      await supabaseAdmin.from("knowledge_source_objects").update({ is_current: true }).eq("id", existing.id);
    }
    throw error;
  }
  return { id: data.id as string, action: existing ? "updated" as const : "created" as const };
}

async function persistKnowledge(
  source: KnowledgeSource,
  proposal: ProposedKnowledge,
  sourceObjectIds: Map<string, string>,
  actorAuthUserId?: string
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("knowledge_items")
    .select("id,review_status,version")
    .eq("knowledge_key", proposal.knowledgeKey)
    .eq("is_current", true)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.review_status === "approved") {
    return { id: existing.id as string, action: "skipped" as const };
  }

  const row = {
    primary_source_id: source.id,
    knowledge_type: proposal.knowledgeType,
    title: proposal.title,
    summary: proposal.summary,
    content: proposal.content ?? null,
    source_url: proposal.sourceUrl ?? null,
    occurred_at: proposal.occurredAt ?? null,
    period_start: proposal.periodStart ?? null,
    period_end: proposal.periodEnd ?? null,
    category: proposal.category ?? source.default_category,
    tags: proposal.tags,
    importance: proposal.importance,
    confidence: proposal.confidence ?? null,
    privacy_level: proposal.privacyLevel,
    publishability: proposal.publishability,
    contains_personal_data: proposal.privacyLevel === 3,
    redaction_status: proposal.publishability === "anonymize" ? "required" : "not_required",
    review_status: "needs_review",
    authorship: proposal.authorship,
    verification_status: "unverified",
    metadata: proposal.metadata,
  };

  let itemId: string;
  let action: "created" | "updated";
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("knowledge_items")
      .update(row)
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw error;
    itemId = data.id as string;
    action = "updated";
  } else {
    const { data, error } = await supabaseAdmin
      .from("knowledge_items")
      .insert({
        ...row,
        knowledge_key: proposal.knowledgeKey,
        created_by: actorAuthUserId ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    itemId = data.id as string;
    action = "created";
  }

  const evidenceRows = proposal.evidenceExternalIds.flatMap((externalId) => {
    const sourceObjectId = sourceObjectIds.get(externalId);
    return sourceObjectId ? [{
      knowledge_item_id: itemId,
      source_object_id: sourceObjectId,
      relation_type: "derived_from",
      confidence: proposal.confidence ?? null,
    }] : [];
  });
  if (evidenceRows.length) {
    const { error } = await supabaseAdmin
      .from("knowledge_evidence_links")
      .upsert(evidenceRows, {
        onConflict: "knowledge_item_id,source_object_id,relation_type",
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }
  return { id: itemId, action };
}

async function persistCodeArtifact(sourceObjectId: string, object: NormalizedSourceObject) {
  if (object.objectType !== "github_file") return;
  const github = object.metadata.github;
  if (!github || typeof github !== "object") return;
  const data = github as Record<string, unknown>;
  const { error } = await supabaseAdmin.from("knowledge_code_artifacts").upsert({
    source_object_id: sourceObjectId,
    repository: data.repository,
    branch: data.branch,
    path: data.path,
    commit_sha: data.commitSha,
    file_url: data.fileUrl,
    language: data.language ?? null,
    component: data.component ?? null,
    feature: data.feature ?? null,
    architectural_role: data.architecturalRole ?? null,
    summary: data.summary,
    related_tables: data.relatedTables ?? [],
    related_api_routes: data.relatedApiRoutes ?? [],
    security_relevance: data.securityRelevance ?? [],
    analysis_confidence: data.analysisConfidence ?? null,
    last_analyzed_at: new Date().toISOString(),
  }, { onConflict: "source_object_id" });
  if (error) throw error;
}

export async function runKnowledgeSource(options: RunOptions): Promise<KnowledgeRunResult> {
  const dryRun = options.jobType === "dry_run";
  const { data: sourceData, error: sourceError } = await supabaseAdmin
    .from("knowledge_sources")
    .select("*")
    .eq("id", options.sourceId)
    .single();
  if (sourceError || !sourceData) throw new Error("情報源が見つかりません。");
  const source = sourceData as KnowledgeSource;

  const { data: checkpointData, error: checkpointError } = await supabaseAdmin
    .from("knowledge_source_checkpoints")
    .select("cursor,cursor_version")
    .eq("source_id", source.id)
    .maybeSingle();
  if (checkpointError) throw checkpointError;
  const cursorBefore = (checkpointData?.cursor ?? {}) as Record<string, unknown>;
  const checkpointVersion = Number(checkpointData?.cursor_version ?? 0);

  const { data: run, error: runError } = await supabaseAdmin
    .from("knowledge_sync_runs")
    .insert({
      source_id: source.id,
      job_type: options.jobType,
      trigger_type: options.triggerType,
      status: "running",
      dry_run: dryRun,
      checkpoint_version_before: checkpointVersion,
      cursor_before: cursorBefore,
      started_by: options.actorAuthUserId ?? null,
      started_at: new Date().toISOString(),
      lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .select("id,started_at")
    .single();
  if (runError || !run) {
    if (runError?.code === "23505") throw new Error("この情報源はすでに同期中です。");
    throw runError ?? new Error("同期履歴を作成できませんでした。");
  }

  const startedAt = Date.now();
  try {
    const connector = getKnowledgeConnector(source.connector_key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);
    let result;
    try {
      result = await connector.fetchDelta({ source, cursor: cursorBefore, dryRun, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const securedObjects = result.objects.map((object) => secureSourceObject(source, object));
    const securedKnowledge = result.proposedKnowledge.map((proposal) => secureProposedKnowledge(source, proposal));
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const sourceObjectIds = new Map<string, string>();

    if (dryRun) {
      created = securedObjects.length + securedKnowledge.length;
    } else {
      for (const object of securedObjects) {
        const persisted = await persistSourceObject(source, object);
        sourceObjectIds.set(object.externalId, persisted.id);
        await persistCodeArtifact(persisted.id, object);
        if (persisted.action === "created") created += 1;
        else if (persisted.action === "updated") updated += 1;
        else skipped += 1;
      }
      for (const proposal of securedKnowledge) {
        const persisted = await persistKnowledge(source, proposal, sourceObjectIds, options.actorAuthUserId);
        if (persisted.action === "created") created += 1;
        else if (persisted.action === "updated") updated += 1;
        else skipped += 1;
      }

      const checkpointUpdate = await supabaseAdmin
        .from("knowledge_source_checkpoints")
        .update({
          cursor: result.nextCursor,
          cursor_version: checkpointVersion + 1,
          last_success_at: new Date().toISOString(),
          last_object_at: new Date().toISOString(),
        })
        .eq("source_id", source.id)
        .eq("cursor_version", checkpointVersion)
        .select("source_id");
      if (checkpointUpdate.error) throw checkpointUpdate.error;
      if (!checkpointUpdate.data?.length) throw new Error("同期カーソルが競合しました。");
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAt;
    const processed = securedObjects.length + securedKnowledge.length;
    await supabaseAdmin.from("knowledge_sync_runs").update({
      status: "succeeded",
      processed,
      created_count: created,
      updated_count: updated,
      skipped_count: skipped,
      summarized_count: securedKnowledge.length,
      cursor_after: result.nextCursor,
      output_summary: { warnings: result.warnings, proposedCursor: result.nextCursor },
      finished_at: finishedAt,
      duration_ms: durationMs,
      lease_expires_at: null,
    }).eq("id", run.id);
    await supabaseAdmin.from("knowledge_sources").update({
      last_run_at: finishedAt,
      last_success_at: finishedAt,
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
      next_run_at: calculateNextRunAt(source, new Date(finishedAt)),
    }).eq("id", source.id);

    return {
      runId: run.id as string,
      sourceId: source.id,
      dryRun,
      processed,
      created,
      updated,
      skipped,
      summarized: securedKnowledge.length,
      cursorBefore,
      cursorAfter: result.nextCursor,
      warnings: result.warnings,
    };
  } catch (error) {
    const safe = safeError(error);
    const finishedAt = new Date().toISOString();
    await supabaseAdmin.from("knowledge_sync_runs").update({
      status: "failed",
      error_code: safe.code,
      error_message: safe.message,
      finished_at: finishedAt,
      duration_ms: Date.now() - startedAt,
      lease_expires_at: null,
    }).eq("id", run.id);
    await supabaseAdmin.from("knowledge_sources").update({
      last_run_at: finishedAt,
      last_error_at: finishedAt,
      last_error_code: safe.code,
      last_error_message: safe.message,
    }).eq("id", source.id);
    throw new Error(safe.message);
  }
}

export function toKnowledgeItem(row: unknown): KnowledgeItem {
  return row as KnowledgeItem;
}
