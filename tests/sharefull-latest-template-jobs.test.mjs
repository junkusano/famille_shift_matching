import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadEnqueuer({ templates = [], existingJobs = [], clientIds = ["client-a", "client-b"], mode = "production" } = {}) {
  const insertedJobs = [];
  const blocked = [];
  function query(table) {
    const state = { operation: "select", values: null, clientIds: null };
    const builder = {
      select() { return builder; },
      eq(column, value) { state[column] = value; return builder; },
      in(column, values) {
        if (column === "kaipoke_cs_id") state.clientIds = values;
        else state[column] = values;
        return builder;
      },
      not() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      range() {
        const data = table.includes("template_unified")
          ? templates.filter((row) => row.status === state.status && (!state.clientIds || state.clientIds.includes(row.kaipoke_cs_id)))
          : [];
        return Promise.resolve({ data, error: null });
      },
      insert(values) {
        state.operation = "insert";
        state.values = values;
        insertedJobs.push(values);
        return Promise.resolve({ error: null });
      },
      then(resolve, reject) {
        if (table === "rpa_runner_jobs") {
          const matching = existingJobs.filter((job) =>
            (!state["payload->>operation_key"] || job.payload?.operation_key === state["payload->>operation_key"])
            && (!state["payload->>core_id"] || job.payload?.core_id === state["payload->>core_id"])
            && (!state.status || state.status.includes(job.status)));
          return Promise.resolve({ data: matching, error: null }).then(resolve, reject);
        }
        if (table === "env_variables") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const context = vm.createContext({
    exports: {}, process: { env: {} }, console,
    supabaseAdmin: { from: query },
    sharefullSyncClientIds: () => clientIds,
    sharefullTemplateTableName: () => mode === "test" ? "sharefull_rpa_test_spot_offer_template_unified" : "spot_offer_template_unified",
    sharefullRpaMode: () => mode,
    sharefullSyncScopeLabel: () => mode === "test" ? "test" : clientIds?.join(",") ?? "all",
    sharefullTargetRunnerId: () => mode === "test" ? "sharefull-test-runner" : null,
    recordSharefullContentPolicyBlock: async (item) => { blocked.push(item); return { recorded: true, notified: true }; },
  });

  const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const selector = compile("../src/lib/spot-offer/latestSharefullTemplates.ts");
  const policy = compile("../src/lib/spot-sync/sharefullContentPolicy.ts");
  const moduleSource = readFileSync(new URL("../src/lib/spot-offer/enqueueSharefullPublicationJob.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const moduleCode = ts.transpileModule(moduleSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${selector}\n${policy}\n${moduleCode}`, context);
  return { enqueuer: context.exports.enqueueActiveSharefullTemplateCreationJobs, insertedJobs, blocked };
}

test("対象利用者の全activeテンプレートを未作成時にキューへ登録する", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "old-a", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-01", sharefull_template_id: null },
    { core_id: "latest-a", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-03", sharefull_template_id: null },
    { core_id: "latest-b", kaipoke_cs_id: "client-b", status: "active", updated_at: "2026-09-02", sharefull_template_id: null },
    { core_id: "not-target", kaipoke_cs_id: "client-c", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ] });

  const result = await enqueuer("test.latest-templates");
  assert.deepEqual(insertedJobs.map((job) => job.payload.core_id), ["latest-a", "old-a", "latest-b"]);
  assert.equal(result.registeredCount, 3);
});

test("Sharefull ID登録済み・既存ジョブは重複登録せず、要確認本文は記録して作成する", async () => {
  const { enqueuer, insertedJobs, blocked } = loadEnqueuer({ templates: [
    { core_id: "linked", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: "sf-1" },
    { core_id: "queued", kaipoke_cs_id: "client-b", status: "active", updated_at: "2026-09-03", sharefull_template_id: null },
    { core_id: "sensitive", kaipoke_cs_id: "client-c", status: "active", updated_at: "2026-09-02", sharefull_template_id: null, work_description: "女性ヘルパー活躍中" },
  ], existingJobs: [
    { status: "failed", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: { core_id: "queued", operation_key: "sharefull:create_template:queued" } },
  ], clientIds: ["client-a", "client-b", "client-c"], mode: "test" });

  const result = await enqueuer("test.latest-templates");
  assert.deepEqual(insertedJobs.map((job) => job.payload.core_id), ["sensitive"]);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].report.status, "flagged");
  assert.equal(result.registeredCount, 1);
});

test("失敗から1時間未満はテンプレート作成を再投入しない", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "retry-wait", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ], existingJobs: [
    { status: "failed", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: { core_id: "retry-wait", operation_key: "sharefull:create_template:retry-wait" } },
  ] });

  const result = await enqueuer("test.retry-wait");
  assert.equal(insertedJobs.length, 0);
  assert.match(result.skipped[0], /再試行待ち/);
});

test("タイムアウトしたテンプレート作成はSharefull側の照合前に再投入しない", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "timeout-review", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ], existingJobs: [
    {
      status: "failed",
      error_code: "JOB_TIMEOUT",
      error_type: "TIMEOUT",
      error_category: "TIMEOUT",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      payload: { core_id: "timeout-review", operation_key: "sharefull:create_template:timeout-review" },
    },
  ] });

  const result = await enqueuer("test.timeout-review");
  assert.equal(insertedJobs.length, 0);
  assert.match(result.skipped[0], /Sharefull側.*照合/);
});

test("Sharefull作成後のID保存失敗も重複照合前に再投入しない", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "id-save-review", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ], existingJobs: [
    {
      status: "failed",
      error_code: "SupabaseへのSharefull template ID保存失敗",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
      payload: { core_id: "id-save-review", operation_key: "sharefull:create_template:id-save-review" },
    },
  ] });

  const result = await enqueuer("test.id-save-review");
  assert.equal(insertedJobs.length, 0);
  assert.match(result.skipped[0], /Sharefull側.*照合/);
});

test("失敗ジョブは1時間経過後に最大3回まで別キーで再投入する", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "retry-ready", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ], existingJobs: [
    { status: "failed", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z", payload: { core_id: "retry-ready", operation_key: "sharefull:create_template:retry-ready" } },
  ] });

  await enqueuer("test.retry-ready");
  assert.equal(insertedJobs.length, 1);
  assert.equal(insertedJobs[0].payload.operation_key, "sharefull:create_template:retry-ready:retry:1");
});

test("失敗3回で自動再試行を打ち切る", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "retry-capped", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ], existingJobs: [0, 1, 2].map((attempt) => ({
    status: "failed", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    payload: { core_id: "retry-capped", operation_key: attempt === 0 ? "sharefull:create_template:retry-capped" : `sharefull:create_template:retry-capped:retry:${attempt}` },
  })) });

  const result = await enqueuer("test.retry-capped");
  assert.equal(insertedJobs.length, 0);
  assert.match(result.skipped[0], /上限に達しました/);
});
