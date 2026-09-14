import "server-only";

import { runSystemDiagnostics } from "@/lib/knowledge-automation/diagnostics";
import { randomUUID } from "crypto";
import { queueVerifiedBlogShares, recoverBlogSocialShares } from "./socialSharing";
import { calculateAutomationNextRunAt } from "@/lib/knowledge-automation/scheduling";
import type { KnowledgeAutomationTask } from "@/lib/knowledge-automation/types";
import { rewriteWordPressBlog } from "@/lib/knowledge-automation/wordpressRewrite";
import { createWordPressBlogDraft } from "@/lib/knowledge-automation/wordpressBlog";
import { runKnowledgeDiff } from "@/lib/knowledge/diff";
import { runExternalInformationAutomation } from "@/lib/knowledge-automation/externalInformation";
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
  const isDailyRewrite = task.settings.operation === "wordpress_blog_rewrite";
  const rewriteDay = new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 10);
  const idempotencyKey = isDailyRewrite ? `rewrite:${rewriteDay}` : input.triggerSource === "schedule" && scheduledFor
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
      lease_expires_at: new Date(now.getTime() + 15 * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (insertError?.code === "23505") {
    if (isDailyRewrite && input.triggerSource === "schedule") {
      await supabaseAdmin.from("knowledge_automation_tasks").update({next_run_at: calculateAutomationNextRunAt(task.trigger_type, task.schedule, task.is_enabled, now)}).eq("id", task.id);
    }
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
    const isRewrite = task.settings.operation === "wordpress_blog_rewrite";
    const isDiagnostics = task.settings.operation === "system_diagnostics";
    const isKnowledgeDiff = task.settings.operation === "knowledge_diff_extract";
    const externalResult = await runExternalInformationAutomation(task, input.triggerSource);
    if (!externalResult && !isDiagnostics && !isKnowledgeDiff && ((!isRewrite && task.task_type !== "wordpress_blog") || task.destination !== "wordpress_post")) {
      throw new Error("この種類の自動化はまだ実行処理が登録されていません。");
    }
    const result = externalResult
      ? externalResult
      : isDiagnostics
        ? await runSystemDiagnostics(task)
        : isKnowledgeDiff
          ? await runKnowledgeDiff({ trigger: "schedule", dryRun: false, taskId: task.id })
          : isRewrite
            ? await rewriteWordPressBlog(task, run.id)
            : await createWordPressBlogDraft(task);
    const finishedAt = new Date().toISOString();
    const diagnosisFailed = "audit" in result && "failed" in result.audit && result.audit.failed === true;
    const status = diagnosisFailed ? "failed" : (result.status === "created" || result.status === "updated" || result.status === "succeeded") ? "succeeded" : "skipped";
    const postId = "postId" in result ? result.postId ?? null : null;
    const postLink = "postLink" in result ? result.postLink ?? null : null;
    const outputSummary = {
      ...("audit" in result ? result.audit : {}),
      message: result.message,
      sourceId: "sourceId" in result ? result.sourceId ?? null : null,
      sourceTitle: "sourceTitle" in result ? result.sourceTitle ?? null : null,
      postId,
      ...("socialPublication" in result ? { socialPublication: result.socialPublication } : {}),
    };
    const savedRun = await supabaseAdmin.from("knowledge_automation_runs").update({
      status,
      safety_result: "allowed",
      safety_findings: [],
      output_summary: outputSummary,
      output_reference: postLink,
      finished_at: finishedAt,
      lease_expires_at: null,
    }).eq("id", run.id);
    if (savedRun.error) throw new Error("実行結果を保存できませんでした。");
    let socialQueueError: string | null = null;
    let message = result.message;
    if ("socialPublication" in result && result.socialPublication && task.settings.social_sharing === true) {
      try {
        const jobs = await queueVerifiedBlogShares(task, run.id, result.socialPublication);
        if (jobs.length) message += " X・Threadsへの投稿を予約しました。投稿結果はSNS投稿状況で確認できます。";
        const { error } = await supabaseAdmin.from("knowledge_automation_runs")
          .update({ output_summary: { ...outputSummary, message, socialQueued: jobs } }).eq("id", run.id);
        if (error) throw new Error("SNS投稿の予約履歴を保存できませんでした。次回再確認します。");
      } catch (error) {
        socialQueueError = error instanceof Error ? error.message : "SNS投稿を予約できませんでした。";
        message += " SNS投稿は予約の再確認待ちです。";
      }
    }
    await supabaseAdmin.from("knowledge_automation_tasks").update({
      ...(status === "succeeded" ? { last_success_at: finishedAt } : {}),
      last_result: message,
      last_error_at: diagnosisFailed || socialQueueError ? finishedAt : null,
      last_error_message: diagnosisFailed ? result.message : socialQueueError,
    }).eq("id", task.id);
    return { ok: !diagnosisFailed && !socialQueueError, status, message, outputReference: postLink };
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
  // SNS recovery is independent of the long-running article-generation tasks.
  await recoverBlogSocialShares().catch(error => console.error("SNS queue recovery failed:", error instanceof Error ? error.message : "unknown"));
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
  const batchStartedAt = Date.now();
  for (const task of data ?? []) {
    // Leave remaining due tasks for the next cron invocation after a long AI job.
    if (results.length > 0 && Date.now() - batchStartedAt > 30_000) break;
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
