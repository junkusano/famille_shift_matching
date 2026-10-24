import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadScope(env = {}) {
  const code = readFileSync(new URL("../src/lib/spot-sync/sharefullScope.ts", import.meta.url), "utf8");
  const context = vm.createContext({ exports: {}, process: { env } });
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

test("Sharefull同期は有効利用者658人の半数329人を固定対象にする", () => {
  const scope = loadScope();
  const expectedClientIds = [
    "8111577",
    "10857804",
    "12278553",
    "12581399",
    "12666844",
    "12698444",
    "12782561",
    "12906710",
    "12988540",
    "8065144",
    "9003819",
    "13611106",
    "13673338",
  ];
  const actual = [...scope.sharefullSyncClientIds()];
  assert.equal(actual.length, 329);
  assert.equal(new Set(actual).size, 329);
  for (const id of expectedClientIds) assert.ok(actual.includes(id), "既存対象を維持する");
  assert.equal(new Set(expectedClientIds).size, expectedClientIds.length);
  assert.equal(scope.isSharefullSyncClient("8111577"), true);
  assert.equal(scope.isSharefullSyncClient("12782561"), true);
  assert.equal(scope.isSharefullSyncClient("13611106"), true);
  assert.equal(scope.isSharefullSyncClient("13673338"), true);
  assert.equal(scope.isSharefullSyncClient("99999999"), false);
});

test("全利用者化には対象指定と明示許可の両方を必要とする", () => {
  const blocked = loadScope({ SHAREFULL_SYNC_KAIPOKE_CS_IDS: "*" });
  assert.deepEqual([...blocked.sharefullSyncClientIds()], [...loadScope().sharefullSyncClientIds()]);

  const allowed = loadScope({
    SHAREFULL_SYNC_KAIPOKE_CS_IDS: "*",
    SHAREFULL_SYNC_ALLOW_ALL: "true",
  });
  assert.equal(allowed.sharefullSyncClientIds(), null);
  assert.equal(allowed.isSharefullSyncClient("99999999"), true);
});

test("テストモードは専用テーブルを使い本番の同期対象指定を無視する", () => {
  const scope = loadScope({
    SHAREFULL_RPA_MODE: "test",
    SHAREFULL_SYNC_KAIPOKE_CS_IDS: "99999999",
  });

  assert.equal(scope.sharefullRpaMode(), "test");
  assert.equal(scope.sharefullTemplateTableName(), "sharefull_rpa_test_spot_offer_template_unified");
  assert.equal(scope.sharefullRequestTableName(), "sharefull_rpa_test_spot_offer_request_table");
  assert.equal(scope.sharefullApplicationTableName(), "sharefull_rpa_test_spot_offer_applications");
  assert.equal(scope.sharefullDecisionStatusTableName(), "sharefull_rpa_test_decision_status");
  assert.equal(scope.sharefullSyncClientIds(), null);
  assert.equal(scope.isSharefullSyncClient("any-client"), true);
  assert.equal(scope.sharefullSyncScopeLabel(), "test");
});

test("応募決定監視はテスト配置・テストモード・明示有効化のすべてが必要", () => {
  assert.equal(loadScope({
    SHAREFULL_DECISION_MONITOR_ENABLED: "true",
    SHAREFULL_TEST_DEPLOYMENT: "true",
    SHAREFULL_RPA_MODE: "production",
  }).shouldRunSharefullDecisionMonitor(), false);

  assert.equal(loadScope({
    SHAREFULL_DECISION_MONITOR_ENABLED: "true",
    SHAREFULL_RPA_MODE: "test",
  }).shouldRunSharefullDecisionMonitor(), false);

  assert.equal(loadScope({
    SHAREFULL_TEST_DEPLOYMENT: "true",
    SHAREFULL_RPA_MODE: "test",
  }).shouldRunSharefullDecisionMonitor(), false);

  assert.equal(loadScope({
    SHAREFULL_DECISION_MONITOR_ENABLED: "true",
    SHAREFULL_TEST_DEPLOYMENT: "true",
    SHAREFULL_RPA_MODE: "test",
  }).shouldRunSharefullDecisionMonitor(), true);
});


test("事務区分のみを個別に許可し利用者スコープは拡大しない",()=>{
 const scope=loadScope();
 assert.equal(scope.isSharefullSyncClient(null),false);
 assert.equal(scope.isSharefullSyncClient(null,{core_id:"office",recruitment_kind:"office"}),true);
 assert.equal(scope.isSharefullSyncClient(null,{core_id:"office",recruitment_kind:"care"}),false);
 assert.equal(scope.isSharefullSyncClient("outside",{core_id:"office",recruitment_kind:"office"}),false);
 assert.equal(scope.sharefullScopeFilter(["123"]),"kaipoke_cs_id.in.(123),recruitment_kind.eq.office");
});
