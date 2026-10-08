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
    const state = { operation: "select", values: null, clientIds: null, filters: {} };
    const builder = {
      select() { return builder; },
      eq(column, value) { state[column] = value; state.filters[column] = value; return builder; },
      in(column, values) { if (column === "kaipoke_cs_id") state.clientIds = values; return builder; },
      not() { return builder; },
      order(column, options) { state.order = { column, ascending: options?.ascending }; return builder; },
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
          const data = existingJobs.filter((job) =>
            (!state.filters["job_type"] || job.job_type === state.filters["job_type"])
            && (!state.filters["payload->>core_id"] || job.payload?.core_id === state.filters["payload->>core_id"]));
          if (state.order?.column === "created_at") data.sort((a, b) => {
            const delta = Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
            return state.order.ascending ? -delta : delta;
          });
          return Promise.resolve({ data, error: null }).then(resolve, reject);
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
  return { enqueuer: context.exports.enqueueLatestSharefullTemplateCreationJobs, insertedJobs, blocked };
}

test("各利用者の最新activeテンプレートだけを未作成時にキューへ登録する", async () => {
  const { enqueuer, insertedJobs } = loadEnqueuer({ templates: [
    { core_id: "old-a", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-01", sharefull_template_id: null },
    { core_id: "latest-a", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-03", sharefull_template_id: null },
    { core_id: "latest-b", kaipoke_cs_id: "client-b", status: "active", updated_at: "2026-09-02", sharefull_template_id: null },
    { core_id: "not-target", kaipoke_cs_id: "client-c", status: "active", updated_at: "2026-09-04", sharefull_template_id: null },
  ] });

  const result = await enqueuer("test.latest-templates");
  assert.deepEqual(insertedJobs.map((job) => job.payload.core_id), ["latest-a", "latest-b"]);
  assert.equal(result.registeredCount, 2);
});

test("Sharefull ID登録済み・実行中ジョブ・要確認本文は新規登録しない", async () => {
  const { enqueuer, insertedJobs, blocked } = loadEnqueuer({ templates: [
    { core_id: "linked", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: "sf-1" },
    { core_id: "queued", kaipoke_cs_id: "client-b", status: "active", updated_at: "2026-09-03", sharefull_template_id: null },
    { core_id: "sensitive", kaipoke_cs_id: "client-c", status: "active", updated_at: "2026-09-02", sharefull_template_id: null, work_description: "女性ヘルパー活躍中" },
  ], existingJobs: [
    { job_type: "sharefull.create_template", status: "running", created_at: "2026-09-03", updated_at: "2026-09-03", payload: { core_id: "queued", operation_key: "sharefull:create_template:queued" } },
  ], clientIds: ["client-a", "client-b", "client-c"], mode: "test" });

  const result = await enqueuer("test.latest-templates");
  assert.deepEqual(insertedJobs, []);
  assert.equal(blocked.length, 1);
  assert.equal(result.registeredCount, 0);
});

test("失敗ジョブは1時間後に最大3回まで別operation keyで再登録する", async () => {
  const failed = (attempt, createdAt, updatedAt = createdAt) => ({
    job_type: "sharefull.create_template",
    status: "failed",
    created_at: createdAt,
    updated_at: updatedAt,
    payload: {
      core_id: "retry-me",
      operation_key: attempt === 1
        ? "sharefull:create_template:retry-me"
        : `sharefull:create_template:retry-me:retry:${attempt - 1}`,
    },
  });
  const template = { core_id: "retry-me", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-03", sharefull_template_id: null };
  const { enqueuer, insertedJobs } = loadEnqueuer({
    templates: [template],
    existingJobs: [failed(1, "2026-09-01T00:00:00.000Z")],
  });

  const result = await enqueuer("test.retry");
  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].payload.operation_key, "sharefull:create_template:retry-me:retry:1");
  assert.equal(insertedJobs[0].payload.sync_operation_key, insertedJobs[0].payload.operation_key);

  const limited = loadEnqueuer({
    templates: [template],
    existingJobs: [
      failed(1, "2026-09-01T00:00:00.000Z"),
      failed(2, "2026-09-02T00:00:00.000Z"),
      failed(3, "2026-09-03T00:00:00.000Z"),
    ],
  });
  const limitedResult = await limited.enqueuer("test.retry");
  assert.equal(limited.insertedJobs.length, 0);
  assert.match(limitedResult.skipped.join(" "), /再試行上限/);
});

test("失敗直後は再試行せず、明示キャンセルも再登録しない", async () => {
  const template = { core_id: "retry-me", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-03", sharefull_template_id: null };
  const recent = loadEnqueuer({ templates: [template], existingJobs: [{
    job_type: "sharefull.create_template", status: "failed", created_at: "2026-10-08T00:00:00.000Z",
    updated_at: new Date().toISOString(), payload: { core_id: "retry-me", operation_key: "sharefull:create_template:retry-me" },
  }] });
  const recentResult = await recent.enqueuer("test.retry");
  assert.equal(recent.insertedJobs.length, 0);
  assert.match(recentResult.skipped.join(" "), /再試行待ち/);

  const cancelled = loadEnqueuer({ templates: [template], existingJobs: [{
    job_type: "sharefull.create_template", status: "cancelled", created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z", payload: { core_id: "retry-me", operation_key: "sharefull:create_template:retry-me" },
  }] });
  const cancelledResult = await cancelled.enqueuer("test.retry");
  assert.equal(cancelled.insertedJobs.length, 0);
  assert.match(cancelledResult.skipped.join(" "), /キャンセル/);
});
