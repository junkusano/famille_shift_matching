import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadPublisher({ env = {}, template = null, requests = [], shifts = [], existingJobs = [], failTemplateCoreId = null } = {}) {
  const insertedJobs = [];
  const usedTables = [];
  const policyBlocks = [];
  const policyCode = readFileSync(new URL("../src/lib/spot-sync/sharefullContentPolicy.ts", import.meta.url), "utf8");
  const code = readFileSync(new URL("../src/lib/spot-offer/enqueueSharefullPublicationJob.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export async function/g, "async function")
    .replace(/export function/g, "function");

  function query(table) {
    const state = { table, operation: "select", values: null, from: 0, to: Number.POSITIVE_INFINITY, filters: {} };
    const builder = {
      select() { state.operation = "select"; return builder; },
      eq(column, value) { state.filters[column] = value; return builder; },
      in() { return builder; },
      limit() { return builder; },
      gte() { return builder; },
      not() { return builder; },
      is() { return builder; },
      or() { return builder; },
      order() { return builder; },
      range(from, to) { state.from = from; state.to = to; return builder; },
      maybeSingle() {
        if (state.filters.core_id === failTemplateCoreId) return Promise.reject(new Error("simulated template lookup failure"));
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
        if (table === "rpa_runner_jobs") return Promise.resolve({ data: existingJobs.filter((row) => !state.filters.core_id || row.payload?.core_id === state.filters.core_id).slice(state.from, state.to + 1), error: null }).then(resolve, reject);
        if (table === "shift") return Promise.resolve({ data: shifts.filter((row) => !state.filters.shift_id || state.filters.shift_id === row.shift_id).slice(state.from, state.to + 1), error: null }).then(resolve, reject);
        if (table.includes("request_table")) return Promise.resolve({ data: requests.filter((row) => !state.filters.core_id || row.core_id === state.filters.core_id).slice(state.from, state.to + 1), error: null }).then(resolve, reject);
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
    recordSharefullContentPolicyBlock: async (input) => {
      policyBlocks.push(input);
      return { recorded: true, notified: true };
    },
  });

  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const policyOutput = ts.transpileModule(policyCode, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${policyOutput}\n${output}\nexports.enqueueSharefullPublicationJobsForTemplate = enqueueSharefullPublicationJobsForTemplate; exports.enqueueSharefullPublicationJobsForReadyTemplates = enqueueSharefullPublicationJobsForReadyTemplates;`, context);
  return { publisher: context.exports, insertedJobs, usedTables, policyBlocks };
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

test("掲載結果が不明な失敗は同じRunnerから保存済み結果だけを照合する", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "template_review", recruitment_revision: 3 }],
    existingJobs: [{ id: "job-1", status: "failed", error_category: "PAGE_AUTOMATION", failed_at: "2000-01-01T00:00:00.000Z", claimed_runner_id: "runner-1", payload: { operation_key: "sharefull:create_spot_offer:save:42:3", spot_offer_request_id: "request-1" } }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "test");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].job_type, "sharefull.create_spot_offer");
  assert.equal(insertedJobs[0].target_runner_id, "runner-1");
  assert.equal(insertedJobs[0].payload.reconcile_only, true);
  assert.equal(insertedJobs[0].payload.reconcile_for_operation_key, "sharefull:create_spot_offer:save:42:3");
});

test("完了通知のない長時間claimedジョブも同じRunnerで結果だけを照合する", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    existingJobs: [{ id: "job-1", status: "claimed", claimed_at: "2000-01-01T00:00:00.000Z", claimed_runner_id: "runner-1", timeout_ms: 300000, payload: { operation_key: "sharefull:create_spot_offer:save:42:3", spot_offer_request_id: "request-1" } }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].target_runner_id, "runner-1");
  assert.equal(insertedJobs[0].payload.reconcile_only, true);
  assert.equal(insertedJobs[0].payload.reconcile_of_job_id, "job-1");
});

test("照合ジョブ自体が失敗したら無限再投入せず人の確認へ回す", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    existingJobs: [
      { id: "job-1", status: "failed", error_category: "PAGE_AUTOMATION", failed_at: "2000-01-01T00:00:00.000Z", claimed_runner_id: "runner-1", payload: { operation_key: "sharefull:create_spot_offer:save:42:3", spot_offer_request_id: "request-1" } },
      { id: "job-2", status: "failed", error_category: "UNEXPECTED", failed_at: "2000-01-01T00:00:00.000Z", claimed_runner_id: "runner-1", payload: { operation_key: "sharefull:create_spot_offer:save:42:3:retry:1", spot_offer_request_id: "request-1", reconcile_only: true, reconcile_of_job_id: "job-1" } },
    ],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(result.registeredCount, 0);
  assert.equal(insertedJobs.length, 0);
});

test("掲載前の設定・ログイン失敗は時間経過後に上限3回まで再試行する", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    existingJobs: [{ status: "failed", error_category: "CONFIGURATION", failed_at: "2000-01-01T00:00:00.000Z", payload: { operation_key: "sharefull:create_spot_offer:save:42:3", spot_offer_request_id: "request-1" } }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].payload.operation_key, "sharefull:create_spot_offer:save:42:3:retry:1");
});

test("掲載対象が再び有効になったcancelledジョブは再投入する", async () => {
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    existingJobs: [{ id: "job-1", status: "cancelled", payload: { operation_key: "sharefull:create_spot_offer:save:42:3", spot_offer_request_id: "request-1" } }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].payload.operation_key, "sharefull:create_spot_offer:save:42:3:retry:1");
});

test("1つのテンプレート照会が失敗しても後続coreの掲載ジョブを登録する", async () => {
  const request = (id, coreId, shiftId) => ({
    id,
    core_id: coreId,
    kaipoke_cs_id: "12782561",
    shift_id: shiftId,
    shift_start_date: "2099-01-02",
    shift_start_time: "09:00",
    shift_end_time: "10:00",
    unit_amount: 1226,
    commute_fee: 0,
    status: "募集中",
    taimee_job_id: `taimee-${shiftId}`,
    sharefull_job_id: null,
    sharefull_status: "ready_for_offer",
    recruitment_revision: 0,
  });
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-2", kaipoke_cs_id: "12782561", sharefull_template_id: "template-2", sharefull_template_status: "ready_for_offer" },
    requests: [request("request-1", "core-1", 41), request("request-2", "core-2", 42)],
    shifts: [{ shift_id: 41, required_staff_count: 1 }, { shift_id: 42, required_staff_count: 1 }],
    failTemplateCoreId: "core-1",
  });

  const result = await publisher.enqueueSharefullPublicationJobsForReadyTemplates("cron");

  assert.equal(result.failedCoreCount, 1);
  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs[0].payload.spot_offer_request_id, "request-2");
});

test("500件を超える掲載候補も複数ページからすべてキューへ登録する", async () => {
  const requests = Array.from({ length: 501 }, (_, index) => ({
    id: `request-${index}`,
    core_id: "core-1",
    kaipoke_cs_id: "12782561",
    shift_id: index + 1,
    shift_start_date: "2099-01-02",
    shift_start_time: "09:00",
    shift_end_time: "10:00",
    unit_amount: 1226,
    commute_fee: 0,
    status: "募集中",
    taimee_job_id: `taimee-${index}`,
    sharefull_job_id: null,
    sharefull_status: "ready_for_offer",
    recruitment_revision: 0,
  }));
  const { publisher, insertedJobs } = loadPublisher({
    env: baseEnv,
    template: { core_id: "core-1", kaipoke_cs_id: "12782561", sharefull_template_id: "template-1", sharefull_template_status: "ready_for_offer" },
    requests,
    shifts: requests.map((row) => ({ shift_id: row.shift_id, required_staff_count: 1 })),
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(result.registeredCount, 501);
  assert.equal(insertedJobs.length, 501);
});

test("テスト環境では要確認文言を記録しつつ案件掲載ジョブを登録する", async () => {
  const { publisher, insertedJobs, policyBlocks } = loadPublisher({
    env: baseEnv,
    template: {
      core_id: "core-1",
      kaipoke_cs_id: "12782561",
      sharefull_template_id: "template-1",
      sharefull_template_status: "ready_for_offer",
      template_title: "女性ヘルパー活躍中",
      work_description: "女性の下着の洗濯等あるため応募には考慮お願いします。",
    },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    shifts: [{ shift_id: 42, required_staff_count: 1 }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "test");

  assert.equal(result.registeredCount, 1);
  assert.equal(insertedJobs.length, 1);
  assert.equal(insertedJobs[0].job_type, "sharefull.create_spot_offer");
  assert.equal(policyBlocks.length, 1);
  assert.equal(policyBlocks[0].coreId, "core-1");
  assert.equal(policyBlocks[0].report.status, "flagged");
  assert.equal(policyBlocks[0].report.findings[0].ruleId, "gender-sensitive-recruiting");
});

test("本番環境でも要確認文言を記録し、案件掲載を継続する", async () => {
  const { publisher, insertedJobs, policyBlocks } = loadPublisher({
    env: { SHAREFULL_RPA_MODE: "production", SHAREFULL_AUTO_POST_ENABLED: "true" },
    template: {
      core_id: "core-1",
      kaipoke_cs_id: "12782561",
      sharefull_template_id: "template-1",
      sharefull_template_status: "ready_for_offer",
      work_description: "女性ヘルパー活躍中",
    },
    requests: [{ id: "request-1", core_id: "core-1", kaipoke_cs_id: "12782561", shift_id: 42, shift_start_date: "2099-01-02", shift_start_time: "09:00", shift_end_time: "10:00", unit_amount: 1226, commute_fee: 0, status: "募集中", taimee_job_id: "taimee-1", sharefull_job_id: null, sharefull_status: "ready_for_offer", recruitment_revision: 3 }],
    shifts: [{ shift_id: 42, required_staff_count: 1 }],
  });

  const result = await publisher.enqueueSharefullPublicationJobsForTemplate("core-1", "cron");

  assert.equal(insertedJobs.length, 1);
  assert.equal(insertedJobs[0].job_type, "sharefull.create_spot_offer");
  assert.equal(policyBlocks.length, 1);
  assert.equal(policyBlocks[0].coreId, "core-1");
  assert.equal(policyBlocks[0].report.status, "flagged");
  assert.equal(result.registeredCount, 1);
});
