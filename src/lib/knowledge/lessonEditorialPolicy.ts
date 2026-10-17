import { createHash } from "crypto";

export const LESSON_EDITORIAL_VERSION = 1;
export type LessonOriginal = {
  id: string; primary_source_id: string; knowledge_key: string; summary: string;
  content: string | null; is_current: boolean; metadata: unknown;
};
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function lessonFingerprint(original: Pick<LessonOriginal, "summary" | "content" | "metadata">) {
  return createHash("sha256").update(JSON.stringify([
    original.summary, original.content, record(original.metadata).sourceRevision ?? null,
  ])).digest("hex");
}
export function lessonJobKey(original: LessonOriginal) {
  return `lesson-editorial:v${LESSON_EDITORIAL_VERSION}:${original.id}:${lessonFingerprint(original)}`;
}
export function originalIsCurrent(original: LessonOriginal, cursor: unknown) {
  const meta = record(original.metadata);
  const checkpoint = record(cursor);
  const hashes = record(record(checkpoint.rowHashes)[String(meta.sheetName ?? "")]);
  const observed = record(record(checkpoint.observedRowHashes ?? checkpoint.rowHashes)[String(meta.sheetName ?? "")]);
  return original.is_current && original.knowledge_key.startsWith("lesson:") &&
    typeof meta.sourceRevision === "string" && hashes[String(meta.rowNumber)] === meta.sourceRevision &&
    observed[String(meta.rowNumber)] === meta.sourceRevision;
}
export function derivativeIsCurrent(derivative: { metadata: unknown }, original: LessonOriginal, cursor: unknown) {
  const editorial = record(record(derivative.metadata).lessonEditorial);
  return originalIsCurrent(original, cursor) && editorial.sourceFingerprint === lessonFingerprint(original);
}

// This is a rejection filter, NOT proof that arbitrary private text is safe.
// Sending restricted originals requires separate explicit consent below.
export function hasPublicationHazard(text: string) {
  return /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:0\d[\dー－\- ]{8,})|〒|生年月日|マイナンバー|口座番号|認証情報|パスワード|API.?キー|(?:[一-龥]{2,4})(?:様|さん|氏)|(?:東京都|北海道|大阪府|京都府|.{2,3}県).{1,20}(?:市|区|町)|LINE WORKS|Myファミーユ|ファミーユ.?ボイス|シフ子|\b(?:ITDT|FBP)\b/i.test(text);
}
export type LessonEditorialConsent = {
  mode: "review" | "automatic"; approvedBy: string; approvedAt: string;
};
export function editorialConsent(settings: Record<string, unknown>): LessonEditorialConsent | null {
  const policy = record(settings.lesson_editorial);
  if (settings.allow_external_ai_context !== true || policy.enabled !== true ||
      policy.allow_restricted_source_processing !== true || policy.version !== LESSON_EDITORIAL_VERSION ||
      !["review", "automatic"].includes(String(policy.mode)) ||
      typeof policy.approved_by !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(policy.approved_by) ||
      typeof policy.approved_at !== "string" || !Number.isFinite(Date.parse(policy.approved_at))) return null;
  return { mode: policy.mode as "review" | "automatic", approvedBy: policy.approved_by, approvedAt: policy.approved_at };
}
