import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadPublisher({ env = {}, template = null, requests = [], shifts = [], existingJobs = [] } = {}) {
  const insertedJobs = [];
  const usedTables = [];
  const code = readFileSync(new URL("../src/lib/spot-offer/enqueueSharefullPublicationJob.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export async function/g, "async function")
    .replace(/export function/g, "function");

  function query(table) {
    const state = { table, operation: "select", values: null };
    const builder = {
      select() { state.operation = "select"; return builder; },
      eq() { return builder; },
      in() { return builder; },
      limit() { return builder; },
      gte() { return builder; },
      not() { return builder; },
      is() { return builder; },
      or() { return builder; },
      order() { return builder; },
      maybeSingle() {
        return Promise.resolve({ data: template, error: null });
      },
      insert(values) {
        state.operation = "insert";
        state.values = values;
        insertedJobs.push(values);
        return Promise.resolve({ error: null });
      },
      update(values) {
        state.operation = "update";
        state.values = values;
        return builder;
      },
      then(resolve, reject) {
        if (state.operation === "update") return Promise.resolve({ error: null }).then(resolve, reject);
        if (table === "rpa_runner_jobs") return Promise.resolve({ data: existingJobs, error: null }).then(resolve, reject);
        if (table === "shift") return Promise.resolve({ data: shifts, error: null }).then(resolve, reject);
        if (table.includes("request_table")) return Promise.resolve({ data: requests, error: null }).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const context = vm.createContext({
    exports: {},
    process: { env },
    Intl,
    supabaseAdmin: { from: (table) => { usedTables.push(String(table)); return query(String(table)); } },
    providerSyncEnabled: () => false,
    validateSharefullSyncJob: async () => true,
    canRecruit: () => true,
    isSharefullSyncClient: () => true,
    sharefullRequestTableName: () => env.SHAREFULL_RPA_MODE === "test" ? "sharefull_rpa_test_spot_offer_request_table" : "spot_offer_request_table",
    sharefullTemplateTableName: () => env.SHAREFULL_RPA_MODE === "test" ? "sharefull_rpa_test_spot_offer_template_unified" : "spot_offer_template_unified",
    sharefullRpaMode: () => env.SHAREFULL_RPA_MODE === "test" ? "test" : "production",
    sharefullSyncClientIds: () => null,
    sharefullSyncScopeLabel: () => env.SHAREFULL_RPA_MODE === "test" ? "test" : "production",
    sharefullTargetRunnerId: () => env.SHAREFULL_RPA_MODE === "test" ? "sharefull-test-runner" : null,
    SHAREFULL_PUBLICATION_DEDUPE_STATUSES: ["pending", "claimed", "completed", "failed", "cancelled"],
    isDuplicateSharefullPublicationJob: (jobs, operationKey, requestId) => jobs.some((job) =>
      ["pending", "claimed", "completed", "failed", "cancelled"].includes(job.status) &&
      (job.payload?.operation_key === operationKey || job.payload?.spot_offer_request_id === requestId)),
  });

  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${output}\nexports.enqueueSharefullPublicationJobsForTemplate = enqueueSharefullPublicationJobsForTemplate;`, context);
  return { publisher: context.exports, insertedJobs, usedTables };
}

const baseEnv = {
  SHAREFULL_RPA_MODE: "test",
  SHAREFULL_AUTO_POST_ENABLED: "true",
  SHAREFULL_AUTO_POST_MODE: "save",
};

test("テスト環境でテンプレート未作成ならcreate_templateジョブを登録する", async () => {
  const { publisher, insertedJobs, usedTables } = loadPublisher({ env: baseEnv, template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: null, sharefull_template_status: null } });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "test");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].job_type, "sharefull.create_template");
  assert.equal(insertedJobs[0].target_runner_id, "sharefull-test-runner");
  assert.equal(insertedJobs[0].payload.command, "create_template");
  assert.equal(insertedJobs[0].payload.core_id, "core-1");
  assert.ok(usedTables.includes("sharefull_rpa_test_spot_offer_template_unified"));
});

test("審査完了テンプレートからテスト用案件掲載ジョブを登録する", async () => {
  const { publisher, insertedJobs, usedTables } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "template_review", recruitment_revision: 3 }],
    shifts: [{ shift_id: 42, required_staff_count: 2 }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "test");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].job_type, "sharefull.create_spot_offer");
  assert.equal(insertedJobs[0].target_runner_id, "sharefull-test-runner");
  assert.equal(insertedJobs[0].payload.command, "create_spot_offer");
  assert.equal(insertedJobs[0].payload.sharefull_template_id, "template-1");
  assert.equal(insertedJobs[0].payload.headcount, 2);
  assert.equal(insertedJobs[0].payload.rpa_mode, "test");
  assert.equal(insertedJobs[0].payload.execution_mode, "save");
  assert.ok(usedTables.includes("sharefull_rpa_test_spot_offer_request_table"));
});

test("同じ案件の既存掲載ジョブがある場合は再登録しない", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "template_review", recruitment_revision: 3 }],
    existingJobs: [{ status: "failed", payload: { operation_key: "old-key", spot_offer_request_id: "request-1" } }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "test");

  assert.equal(result.registeredCount, 0);
  assert.equal(result.diagnostic.duplicate_job_count, 1);
  assert.equal(insertedJobs.length, 0);
});
