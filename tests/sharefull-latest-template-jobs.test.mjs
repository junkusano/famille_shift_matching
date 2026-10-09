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

test("Sharefull ID登録済み・既存ジョブは重複登録せず、要確認本文は記録して作成する", async () => {
  const { enqueuer, insertedJobs, blocked } = loadEnqueuer({ templates: [
    { core_id: "linked", kaipoke_cs_id: "client-a", status: "active", updated_at: "2026-09-04", sharefull_template_id: "sf-1" },
    { core_id: "queued", kaipoke_cs_id: "client-b", status: "active", updated_at: "2026-09-03", sharefull_template_id: null },
    { core_id: "sensitive", kaipoke_cs_id: "client-c", status: "active", updated_at: "2026-09-02", sharefull_template_id: null, work_description: "女性ヘルパー活躍中" },
  ], existingJobs: [
    { status: "failed", payload: { operation_key: "sharefull:create_template:queued" } },
  ], clientIds: ["client-a", "client-b", "client-c"], mode: "test" });

  const result = await enqueuer("test.latest-templates");
  assert.deepEqual(insertedJobs.map((job) => job.payload.core_id), ["sensitive"]);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].report.status, "flagged");
  assert.equal(result.registeredCount, 1);
});
