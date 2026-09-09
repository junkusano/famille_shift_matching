import "server-only";
import { supabaseAdmin } from "@/lib/supabase/service";
import { aggregateRuntime, compareFindings, type DiagnosticFinding } from "@/lib/knowledge-automation/diagnosticsCore";
import type { KnowledgeAutomationTask } from "@/lib/knowledge-automation/types";

type Coverage = { provider: string; status: "complete" | "partial" | "failed"; message: string };
type RequestRow = Parameters<typeof aggregateRuntime>[0][number];

async function fetchJson(url: URL, token: string) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function vercelFindings(since: number, until: number) {
  const token = process.env.DIAGNOSTICS_VERCEL_TOKEN;
  const project = process.env.DIAGNOSTICS_VERCEL_PROJECT_ID;
  const team = process.env.DIAGNOSTICS_VERCEL_TEAM_ID;
  if (!token || !project || !team) throw new Error("未設定");
  const rows: RequestRow[] = [];
  let hasMore = true;
  // Same endpoint and pagination as the official Vercel CLI; capped to bound work.
  for (let page = 0; page < 5 && hasMore; page++) {
    const url = new URL("https://vercel.com/api/logs/request-logs");
    Object.entries({ projectId: project, ownerId: team, environment: "production", level: "error,fatal,warning", startDate: String(since), endDate: String(until), page: String(page) }).forEach(([key, value]) => url.searchParams.set(key, value));
    const body = await fetchJson(url, token);
    if (!Array.isArray(body.rows) || typeof body.hasMoreRows !== "boolean") throw new Error("形式不一致");
    rows.push(...body.rows);
    hasMore = body.hasMoreRows;
  }
  return { findings: aggregateRuntime(rows), partial: hasMore };
}

async function supabaseFindings() {
  const token = process.env.DIAGNOSTICS_SUPABASE_ACCESS_TOKEN;
  const ref = process.env.DIAGNOSTICS_SUPABASE_PROJECT_REF;
  if (!token || !ref || !/^[a-z0-9]+$/.test(ref)) throw new Error("未設定");
  const results = await Promise.all(["security", "performance"].map(async type => {
    const body = await fetchJson(new URL(`https://api.supabase.com/v1/projects/${ref}/advisors/${type}`), token);
    const lints = Array.isArray(body) ? body : body.lints;
    if (!Array.isArray(lints)) throw new Error("形式不一致");
    return lints;
  }));
  const grouped = new Map<string, DiagnosticFinding>();
  for (const item of results.flat()) {
    if (!["ERROR", "WARN"].includes(item.level)) continue;
    // Do not store raw details (which may contain sensitive columns or values).
    const category = /^[a-z_]{1,100}$/.test(item.name) ? item.name : "database_advisor";
    const object = [item.metadata?.schema, item.metadata?.name].filter(x => typeof x === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,100}$/.test(x)).join(".");
    const key = `supabase:${category}:${object}`;
    if (!grouped.has(key)) grouped.set(key, { key, provider: "supabase", category, severity: item.level, route: object, count: 1,
      recommendation: /rls|security_definer/.test(category) ? "呼び出し元の権限と既存RLSを確認し、画面への影響を確認して段階的に修正してください。" : "Supabase Advisorの原本と対象DB設定・索引・関数を確認してください。", codePaths: [] });
  }
  return [...grouped.values()];
}

export async function runSystemDiagnostics(task: KnowledgeAutomationTask) {
  if (task.destination !== "none") throw new Error("システム診断は保存のみを選択してください。");
  const until = Date.now();
  const since = until - 24 * 60 * 60_000;
  const settled = await Promise.allSettled([vercelFindings(since, until), supabaseFindings()]);
  const coverage: Coverage[] = [];
  let findings: DiagnosticFinding[] = [];
  settled.forEach((result, index) => {
    const provider = index === 0 ? "vercel" : "supabase";
    if (result.status === "rejected") {
      coverage.push({ provider, status: "failed", message: "接続設定・参照権限またはサービス応答を確認してください。取得失敗のため正常判定できません。" });
    } else if (Array.isArray(result.value)) {
      findings.push(...result.value);
      coverage.push({ provider, status: "complete", message: "セキュリティ・性能の診断項目を取得しました。" });
    } else {
      findings.push(...result.value.findings);
      coverage.push({ provider, status: "partial", message: result.value.partial ? "取得上限に到達。ログは一部です。" : "24時間を指定して取得。サービスのログ保持期間より前は確認できません。" });
    }
  });
  // All-or-nothing inference is forbidden: missing logs never mean healthy/resolved.
  const complete = coverage.every(item => item.status === "complete");
  const { data: previous, error: previousError } = await supabaseAdmin.from("knowledge_automation_runs")
    .select("output_summary").eq("task_id", task.id).eq("output_summary->>kind", "system_diagnostics").in("status", ["succeeded", "skipped"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previousError) throw new Error("過去の診断を取得できませんでした。");
  const previousFindings = Array.isArray(previous?.output_summary?.findings) ? previous.output_summary.findings as DiagnosticFinding[] : [];
  const changes = compareFindings(findings, previousFindings, complete);
  // Resolve code links from stored, current source objects, not invented paths.
  const routes = [...new Set(findings.filter(item => item.provider === "vercel" && item.route.startsWith("/api/")).map(item => `src/app${item.route}/route.ts`))];
  if (routes.length) {
    const { data, error } = await supabaseAdmin.from("knowledge_source_objects")
      .select("title,source_revision,last_seen_at").eq("is_current", true).eq("object_type", "github_file").in("title", routes).limit(200);
    if (error) coverage.push({ provider: "code_knowledge", status: "failed", message: "コードナレッジの照合に失敗しました。" });
    else findings = findings.map(item => ({ ...item, codePaths: (data ?? []).filter(row => row.title === `src/app${item.route}/route.ts`).map(row => row.title) }));
  }
  const terms = [...new Set(findings.map(item => item.category))].slice(0, 20);
  const { data: knowledge, error: knowledgeError } = terms.length ? await supabaseAdmin.from("knowledge_items")
    .select("id,title,public_summary,updated_at").eq("is_current", true).eq("review_status", "approved").lte("privacy_level", 1).eq("contains_personal_data", false).overlaps("tags", terms).limit(10) : { data: [], error: null };
  if (knowledgeError) coverage.push({ provider: "past_knowledge", status: "failed", message: "過去ナレッジの照合に失敗しました。" });
  const failed = coverage.some(item => item.status === "failed");
  return { status: "created" as const, postId: null, postLink: null,
    message: `${findings.length}項目（新規${changes.new.length}・増加${changes.worsened.length}）。${failed ? "未取得の情報源があります。" : "診断結果を保存しました。"}`,
    audit: { kind: "system_diagnostics", failed, since: new Date(since).toISOString(), until: new Date(until).toISOString(), coverage, findings, changes,
      relatedKnowledge: (knowledge ?? []).map(row => ({ id: row.id, title: "関連する承認済みナレッジ", summary: row.public_summary ?? "公開用要約未登録。原本を確認してください。", updatedAt: row.updated_at })),
      previousFindingCount: previousFindings.length,
      note: "修正候補は原因の断定ではありません。コード索引は本番デプロイとの一致を未検証です。原本と実行計画で確認してください。" },
  };
}
