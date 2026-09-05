import { z } from "zod";

const nullableText = z.string().trim().max(20_000).nullable().optional();
const stringArray = z.array(z.string().trim().min(1).max(100)).max(50).default([]);

export const knowledgeItemInputSchema = z.object({
  knowledge_type: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(20_000),
  content: nullableText,
  source_url: z.string().trim().url().max(2_000).nullable().optional().or(z.literal("")),
  drive_url: z.string().trim().url().max(2_000).nullable().optional().or(z.literal("")),
  occurred_at: z.string().datetime().nullable().optional().or(z.literal("")),
  period_start: z.string().date().nullable().optional().or(z.literal("")),
  period_end: z.string().date().nullable().optional().or(z.literal("")),
  category: z.string().trim().max(200).nullable().optional(),
  tags: stringArray,
  importance: z.number().int().min(1).max(5).default(3),
  confidence: z.number().min(0).max(1).nullable().optional(),
  related_departments: stringArray,
  related_services: stringArray,
  privacy_level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  publishability: z.enum(["public", "anonymize", "internal_only", "never_publish"]),
  public_summary: z.string().trim().max(20_000).nullable().optional(),
  contains_personal_data: z.boolean().default(false),
  redaction_status: z.enum(["not_required", "required", "in_progress", "completed", "rejected"]),
  review_status: z.enum(["draft", "needs_review", "approved", "rejected", "superseded"]),
  verification_status: z.enum(["unverified", "partially_verified", "verified", "disputed"]),
});

export type KnowledgeItemInput = z.infer<typeof knowledgeItemInputSchema>;

export function validatePublicationSafety(input: KnowledgeItemInput): string | null {
  if (input.publishability !== "public") return null;
  if (input.privacy_level !== 0) return "公開可能にするにはprivacy levelを0にしてください。";
  if (input.contains_personal_data) return "個人情報を含むナレッジは公開可能にできません。";
  if (input.review_status !== "approved") return "公開可能にするにはレビュー承認が必要です。";
  if (!input.public_summary?.trim()) return "公開用要約を入力してください。";
  return null;
}

export const sourceUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  sync_frequency: z.enum(["manual", "hourly", "daily", "weekly", "monthly"]).optional(),
  schedule: z.record(z.string(), z.unknown()).optional(),
  next_run_at: z.string().datetime().nullable().optional(),
});

