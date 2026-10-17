import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  derivativeIsCurrent, lessonFingerprint, lessonJobKey, originalIsCurrent, record,
  type LessonOriginal,
} from "./lessonEditorialPolicy";

const ORIGINAL_FIELDS = "id,primary_source_id,knowledge_key,summary,content,is_current,metadata,updated_at";
type Db = typeof supabaseAdmin;
export type LessonEditorialResult = { originals: number; queued: number; needsReview: number; approved: number; obsolete: number; remaining: number };

async function sourceState(db: Db, sourceId: string) {
  const { data, error } = await db.from("knowledge_source_checkpoints").select("cursor").eq("source_id", sourceId).maybeSingle();
  if (error) throw new Error("教訓の同期版を確認できませんでした。");
  return data?.cursor;
}

/** No external calls: changed originals become restricted editorial work items. */
export async function refreshLessonEditorial(db: Db = supabaseAdmin): Promise<LessonEditorialResult> {
  const result = { originals: 0, queued: 0, needsReview: 0, approved: 0, obsolete: 0, remaining: 0 };
  const source = await db.from("knowledge_sources").select("id").eq("source_key", "lesson-reminders").eq("enabled", true).maybeSingle();
  if (source.error) throw new Error("教訓の情報源を確認できませんでした。");
  if (!source.data) return result;
  const cursor = await sourceState(db, source.data.id);
  // Do not infer deletions from an absent/old checkpoint.
  if (!record(cursor).rowHashes) throw new Error("教訓の同期が未完了のため、公開用候補を更新できません。");
  type Derivative = { id: string; parent_knowledge_id: string; knowledge_key: string; metadata: unknown; approved_at: string | null; review_status: string };
  const byParent = new Map<string, Derivative[]>();
  for (let offset = 0; ; offset += 100) {
    const page = await db.from("knowledge_items").select("id,parent_knowledge_id,knowledge_key,metadata,approved_at,review_status")
      .eq("primary_source_id", source.data.id).eq("is_current", true).not("parent_knowledge_id", "is", null).order("id").range(offset, offset + 99);
    if (page.error) throw new Error("公開用教訓の改訂履歴を確認できませんでした。");
    for (const item of (page.data ?? []) as Derivative[]) byParent.set(item.parent_knowledge_id, [...(byParent.get(item.parent_knowledge_id) ?? []), item]);
    if (!page.data || page.data.length < 100) break;
  }
  let writes = 0;
  for (let offset = 0; ; offset += 100) {
    const page = await db.from("knowledge_items").select(ORIGINAL_FIELDS)
      .eq("primary_source_id", source.data.id).eq("knowledge_type", "lesson_principle").eq("is_current", true)
      .like("knowledge_key", "lesson:%").order("id").range(offset, offset + 99);
    if (page.error) throw new Error("教訓原文を取得できませんでした。");
    for (const original of (page.data ?? []) as (LessonOriginal & { updated_at: string })[]) {
      result.originals++;
      const current = originalIsCurrent(original, cursor);
      let covered = false;
      for (const item of byParent.get(original.id) ?? []) {
        const editorial = record(record(item.metadata).lessonEditorial);
        const fresh = current && (editorial.sourceFingerprint
          ? derivativeIsCurrent(item, original, cursor)
          : item.approved_at && Date.parse(original.updated_at) <= Date.parse(item.approved_at));
        if (!fresh && item.review_status !== "superseded") {
          if (writes >= 20) { result.remaining++; continue; }
          const retired = await db.from("knowledge_items").update({ review_status: "superseded", publishability: "never_publish" })
            .eq("id", item.id).eq("review_status", item.review_status);
          if (retired.error) throw new Error("変更前の公開用教訓を停止できませんでした。");
          result.obsolete++;
          writes++;
        }
        if (fresh && item.review_status === "superseded" && item.knowledge_key === lessonJobKey(original)) {
          covered = true;
          if (writes >= 20) { result.remaining++; continue; }
          const reopened = await db.from("knowledge_items").update({ review_status: "needs_review", publishability: "never_publish", approved_at: null, approved_by: null })
            .eq("id", item.id).eq("review_status", "superseded");
          if (reopened.error) throw new Error("教訓の再確認を登録できませんでした。");
          writes++; result.needsReview++;
          continue;
        }
        if (fresh && item.review_status !== "superseded") {
          covered = true;
          if (item.review_status === "approved") result.approved++; else result.needsReview++;
        }
      }
      if (!current || covered) continue;
      if (writes >= 20) { result.remaining++; continue; }
      const inserted = await db.from("knowledge_items").insert({
        knowledge_key: lessonJobKey(original), primary_source_id: original.primary_source_id,
        parent_knowledge_id: original.id, knowledge_type: "lesson_principle",
        title: "公開用への一般化が必要な教訓", summary: "参照元の教訓を確認し、社内固有情報を除いた公開用要約を作成してください。",
        public_summary: null, privacy_level: 3, publishability: "never_publish",
        review_status: "needs_review", redaction_status: "required", authorship: "source",
        metadata: { lessonEditorial: { version: 1, sourceFingerprint: lessonFingerprint(original), sourceId: original.id, state: "needs_review" } },
      });
      // A concurrent worker may have registered this exact revision already.
      if (inserted.error && inserted.error.code !== "23505") throw new Error("教訓の確認待ちを登録できませんでした。");
      if (!inserted.error) result.queued++;
      writes++;
      result.needsReview++;
    }
    if (!page.data || page.data.length < 100) break;
  }
  return result;
}

/** Validate again immediately before a WordPress write, after slow AI/image work. */
export async function isLessonPublicationCurrent(id: string, db: Db = supabaseAdmin) {
  const item = await db.from("knowledge_items").select("metadata,parent_knowledge_id,approved_at,review_status,is_current,public_summary,privacy_level,publishability,redaction_status,contains_personal_data")
    .eq("id", id).single();
  if (item.error) throw new Error("教訓の公開可否を再確認できませんでした。");
  const row = item.data;
  if (!row.is_current || row.review_status !== "approved" || !row.public_summary || row.privacy_level > 1 ||
      !["public", "anonymize"].includes(row.publishability) || row.redaction_status !== "completed" || row.contains_personal_data) return false;
  const metadata = record(row.metadata);
  const parentId = row.parent_knowledge_id ?? metadata.derivedFromKnowledgeId;
  if (!parentId) return false;
  const original = await db.from("knowledge_items").select(ORIGINAL_FIELDS).eq("id", parentId).single();
  if (original.error) return false;
  const cursor = await sourceState(db, original.data.primary_source_id);
  if (!originalIsCurrent(original.data as LessonOriginal, cursor)) return false;
  if (metadata.lessonEditorial) return derivativeIsCurrent(row, original.data as LessonOriginal, cursor);
  // The eight existing human-authorized derivatives have an exact approval timestamp.
  return !!row.approved_at && Date.parse(original.data.updated_at) <= Date.parse(row.approved_at);
}
