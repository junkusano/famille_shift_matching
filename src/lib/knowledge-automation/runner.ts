import "server-only";

import { randomUUID } from "crypto";
import { calculateAutomationNextRunAt } from "@/lib/knowledge-automation/scheduling";
import type { KnowledgeAutomationTask } from "@/lib/knowledge-automation/types";
import { createWordPressBlogDraft } from "@/lib/knowledge-automation/wordpressBlog";
import { supabaseAdmin } from "@/lib/supabase/service";
import { WordPressApiError } from "@/lib/wordpress/server";

type TriggerSource = "schedule" | "manual" | "retry";

function safeError(error: unknown) {
  if (error instanceof WordPressApiError) {
    return { code: error.code ?? "WORDPRESS_FAILED", message: error.message.slice(0, 1_000) };
  }
  if (error instanceof Error && error.name === "ZodError") {
    return { code: "AI_OUTPUT_INVALID", message: "記事の生成結果を安全に整形できませんでした。" };
  }
  const message = error instanceof Error ? error.message : "自動化の実行に失敗しました。";
  if (/token|secret|authorization|credential|api.?key/i.test(message)) {
    return { code: "CONNECTION_FAILED", message: "外部サービスの認証または接続に失敗しました。" };
  }
  return { code: "AUTOMATION_FAILED", message: message.slice(0, 1_000) };
}

async function fetchTask(taskId: string) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_automation_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error("自動化タスクを読み込めませんでした。");
  if (!data) throw new Error("自動化タスクが見つかりません。");
  return data as KnowledgeAutomationTask;
}

export async function runKnowledgeAutomationTask(input: {
  taskId: string;
  triggerSource: TriggerSource;
  scheduledFor?: string | null;
}) {
  const task = await fetchTask(input.taskId);
  if (input.triggerSource === "schedule" && !task.is_enabled) {
    return { ok: true, status: "skipped" as const, message: "停止中のため実行しませんでした。" };
  }

  const now = new Date();
  const scheduledFor = input.scheduledFor ?? task.next_run_at;
  const idempotencyKey = input.triggerSource === "schedule" && scheduledFor
    ? `schedule:${scheduledFor}`
    : `${input.triggerSource}:${randomUUID()}`;
  const { data: run, error: insertError } = await supabaseAdmin
    .from("knowledge_automation_runs")
    .insert({
      task_id: task.id,
      status: "running",
      trigger_source: input.triggerSource,
      scheduled_for: scheduledFor,
      idempotency_key: idempotencyKey,
      input_summary: { taskType: task.task_type, destination: task.destination },
      claimed_at: now.toISOString(),
      started_at: now.toISOString(),
      lease_expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (insertError?.code === "23505") {
    return { ok: true, status: "skipped" as const, message: "同じ予定分はすでに実行済みです。" };
  }
  if (insertError || !run) throw new Error("実行履歴を開始できませんでした。");

  if (input.triggerSource === "schedule") {
    await supabaseAdmin.from("knowledge_automation_tasks").update({
      next_run_at: calculateAutomationNextRunAt(task.trigger_type, task.schedule, task.is_enabled, now),
      last_run_at: now.toISOString(),
    }).eq("id", task.id);
  } else {
    await supabaseAdmin.from("knowledge_automation_tasks").update({ last_run_at: now.toISOString() }).eq("id", task.id);
  }

  try {
    if (task.task_type !== "wordpress_blog" || task.destination !== "wordpress_post") {
      throw new Error("この種類の自動化はまだ実行処理が登録されていません。");
    }
    const result = await createWordPressBlogDraft(task);
    const finishedAt = new Date().toISOString();
    const status = result.status === "created" ? "succeeded" : "skipped";
    await supabaseAdmin.from("knowledge_automation_runs").update({
      status,
      safety_result: "allowed",
      safety_findings: [],
      output_summary: {
        message: result.message,
        sourceId: result.sourceId ?? null,
        sourceTitle: result.sourceTitle ?? null,
        postId: result.postId ?? null,
      },
      output_reference: result.postLink ?? null,
      finished_at: finishedAt,
      lease_expires_at: null,
    }).eq("id", run.id);
    await supabaseAdmin.from("knowledge_automation_tasks").update({
      ...(status === "succeeded" ? { last_success_at: finishedAt } : {}),
      last_result: result.message,
      last_error_at: null,
      last_error_message: null,
    }).eq("id", task.id);
    return { ok: true, status, message: result.message, outputReference: result.postLink ?? null };
  } catch (error) {
    const safe = safeError(error);
    const finishedAt = new Date().toISOString();
    const isDuplicate = error instanceof WordPressApiError && error.code === "wordpress_post_draft_exists";
    await supabaseAdmin.from("knowledge_automation_runs").update({
      status: isDuplicate ? "skipped" : "failed",
      safety_result: "allowed",
      error_code: safe.code,
      error_message: safe.message,
      finished_at: finishedAt,
      lease_expires_at: null,
    }).eq("id", run.id);
    await supabaseAdmin.from("knowledge_automation_tasks").update({
      last_result: isDuplicate ? safe.message : null,
      ...(isDuplicate ? { last_error_at: null, last_error_message: null } : {
        last_error_at: finishedAt,
        last_error_message: safe.message,
      }),
    }).eq("id", task.id);
    if (isDuplicate) return { ok: true, status: "skipped" as const, message: safe.message };
    return { ok: false, status: "failed" as const, message: safe.message };
  }
}

export async function runDueKnowledgeAutomations(now = new Date()) {
  const { data, error } = await supabaseAdmin
    .from("knowledge_automation_tasks")
    .select("id,next_run_at")
    .eq("is_enabled", true)
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(3);
  if (error) throw new Error("実行予定の自動化を取得できませんでした。");
  const results = [];
  for (const task of data ?? []) {
    results.push({
      taskId: task.id,
      ...await runKnowledgeAutomationTask({
        taskId: task.id,
        triggerSource: "schedule",
        scheduledFor: task.next_run_at,
      }),
    });
  }
  return results;
}
