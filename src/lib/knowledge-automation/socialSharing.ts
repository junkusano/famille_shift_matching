import "server-only";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import type { KnowledgeAutomationTask } from "./types";

export type SocialPublication = { postId: number; url: string; title: string; revision: string; kind: "created" | "updated"; verifiedAt: string };

export function socialPublication(postId: number, url: string, title: string, content: string, kind: SocialPublication["kind"]): SocialPublication {
  return { postId, url, title, kind, revision: createHash("sha256").update(content).digest("hex"), verifiedAt: new Date().toISOString() };
}

export function buildSocialJob(p: SocialPublication, platform: "x" | "threads", account: string, taskId: string, runId: string, runnerId: string) {
  const url = new URL(p.url);
  if (url.protocol !== "https:" || !["shi-on.net", "www.shi-on.net"].includes(url.hostname) || url.username || url.password || url.port
    || !Number.isSafeInteger(p.postId) || p.postId <= 0 || !/^[a-f0-9]{64}$/.test(p.revision)
    || !/^[A-Za-z0-9_.]{1,64}$/.test(account) || !/^[A-Za-z0-9_-]{3,80}$/.test(runnerId)) throw new Error("SNS投稿設定が不正です。");
  const date = new Date(new Date(p.verifiedAt).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const title = [...p.title.replace(/\s+/g, " ").trim()].slice(0, 95).join("");
  const text = `${p.kind === "updated" ? `記事を更新しました（${date}）` : "記事を公開しました"}\n${title}\n${p.url}`;
  const operationKey = `blog-social:${platform}:${p.kind}:${p.postId}${p.kind === "updated" ? `:${p.revision}` : ""}`;
  // Stable primary key prevents duplicate jobs during concurrent execution and recovery.
  const hex = createHash("sha256").update(operationKey).digest("hex");
  const id = `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
  return { id, job_type: "social.share_blog", status: "pending", timeout_ms: 180_000, target_runner_id: runnerId,
    payload: { platform, account, article_url: p.url, text, operation_key: operationKey, automation_task_id: taskId, automation_run_id: runId, post_id: p.postId } };
}

export async function queueVerifiedBlogShares(task: KnowledgeAutomationTask, runId: string, p: SocialPublication) {
  if (task.settings.social_sharing !== true || task.approval_mode !== "automatic") return [];
  const runnerId = String(task.settings.social_runner_id ?? "");
  const accounts = task.settings.social_accounts as Record<string, string> | undefined;
  const jobs = (["x", "threads"] as const).map(platform => buildSocialJob(p, platform, accounts?.[platform] ?? "", task.id, runId, runnerId));
  for (const job of jobs) {
    const { error } = await supabaseAdmin.from("rpa_runner_jobs").insert(job);
    if (error && error.code !== "23505") throw new Error("SNS投稿の予約を保存できませんでした。次回の定期実行で再確認します。");
  }
  return jobs.map(({ id, payload }) => ({ id, platform: payload.platform }));
}

/** Recover after a stop between saving publication verification and queueing both SNS jobs. */
export async function recoverBlogSocialShares() {
  const { data: tasks, error } = await supabaseAdmin.from("knowledge_automation_tasks").select("*")
    .eq("settings->>social_sharing", "true").eq("is_enabled", true).eq("approval_mode", "automatic");
  if (error) throw new Error("SNS投稿設定を取得できませんでした。");
  for (const task of (tasks ?? []) as KnowledgeAutomationTask[]) {
    const since = task.settings.social_enabled_at;
    if (typeof since !== "string" || !Number.isFinite(Date.parse(since))) continue;
    const { data: runs, error: runError } = await supabaseAdmin.from("knowledge_automation_runs")
      .select("id,output_summary").eq("task_id", task.id).gte("created_at", since)
      .not("output_summary->socialPublication", "is", null).is("output_summary->socialQueued", null)
      .order("created_at", { ascending: true }).limit(10);
    if (runError) throw new Error("SNS投稿待ちの記事を取得できませんでした。");
    for (const run of runs ?? []) {
      const jobs = await queueVerifiedBlogShares(task, run.id, run.output_summary.socialPublication);
      const { error: saveError } = await supabaseAdmin.from("knowledge_automation_runs")
        .update({ output_summary: { ...run.output_summary, socialQueued: jobs } }).eq("id", run.id);
      if (saveError) throw new Error("SNS投稿の予約結果を保存できませんでした。");
    }
  }
}
