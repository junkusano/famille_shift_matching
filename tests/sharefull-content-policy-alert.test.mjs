import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadAlert(mode = "test", { claimAvailable = true, failConfirmation = false } = {}) {
  const code = readFileSync(new URL("../src/lib/spot-sync/sharefullContentPolicyAlert.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const calls = [];
  const selections = [];
  const record = { id: "block-1", notified_at: null, notification_claimed_at: null, notification_error: null };
  const context = vm.createContext({
    exports: {},
    createHash,
    process: { env: { SHAREFULL_RPA_MODE: mode } },
    sharefullRpaMode: () => mode,
    getAccessToken: async () => "token",
    sendLWBotMessage: async (channelId, text, token) => calls.push({ channelId, text, token }),
    supabaseAdmin: {
      from: (table) => {
        let pendingUpdate = null;
        const builder = {
          upsert: (values) => { calls.push({ type: "upsert", table, values }); Object.assign(record, values); return builder; },
          select: (fields) => { selections.push({ table, fields }); return builder; },
          single: async () => ({ data: { ...record }, error: null }),
          maybeSingle: async () => {
            if (!claimAvailable || !pendingUpdate?.notification_claimed_at) return { data: null, error: null };
            Object.assign(record, pendingUpdate);
            pendingUpdate = null;
            return { data: { id: "block-1" }, error: null };
          },
          update: (values) => { calls.push({ type: "update", table, values }); pendingUpdate = values; return builder; },
          eq: () => builder,
          is: () => builder,
          then: (resolve, reject) => {
            const values = pendingUpdate;
            pendingUpdate = null;
            if (values && failConfirmation && values.notified_at) {
              return Promise.resolve({ error: new Error("audit write failed") }).then(resolve, reject);
            }
            if (values) Object.assign(record, values);
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };
        return builder;
      },
    },
  });
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${output}\nexports.recordSharefullContentPolicyBlock = recordSharefullContentPolicyBlock;`, context);
  return { alert: context.exports, calls, record, selections };
}

test("停止記録を保存してからLINE WORKSへ通知する", async () => {
  const { alert, calls, selections } = loadAlert();
  const result = await alert.recordSharefullContentPolicyBlock({
    coreId: "444578",
    source: "test",
    templateTitle: "女性ヘルパー活躍中",
    sourceData: { work_description: "女性の下着の洗濯等あるため応募には考慮お願いします。" },
    report: {
      status: "blocked",
      findings: [{ ruleId: "gender-sensitive-recruiting", action: "block", field: "work_description", matchedText: "女性の下着" }],
    },
  });

  assert.equal(result.recorded, true);
  assert.equal(result.notified, true);
  assert.equal(calls[0].table, "sharefull_rpa_test_content_policy_blocks");
  assert.equal(calls[1].channelId, "99142491");
  assert.match(calls[1].text, /444578/);
  assert.match(calls[1].text, /女性の下着/);
  assert.equal(calls[1].token, "token");
  assert.equal(calls[2].type, "update");
  assert.equal(selections[0].fields.includes("notification_claimed_at"), false);
});

test("本番停止は本番専用監査テーブルへ公開本文だけを記録してLINE WORKSへ通知する", async () => {
  const { alert, calls } = loadAlert("production");
  const result = await alert.recordSharefullContentPolicyBlock({
    coreId: "core-1",
    source: "cron",
    templateId: null,
    templateTitle: "訪問介護",
    sourceData: {
      template_title: "訪問介護",
      work_description: "女性ヘルパー活躍中",
      internal_note: "保存してはいけない内部情報",
      env: { sukima_detail: "公開される文言", private_secret: "保存してはいけない秘密" },
    },
    report: {
      status: "blocked",
      findings: [{ ruleId: "gender-sensitive-recruiting", action: "block", field: "work_description", matchedText: "女性ヘルパー" }],
    },
  });

  assert.equal(result.recorded, true);
  assert.equal(result.notified, true);
  assert.equal(calls[0].table, "sharefull_content_policy_blocks");
  assert.equal(calls[1].values.notification_claimed_at !== undefined, true);
  assert.equal(calls[2].channelId, "99142491");
  assert.match(calls[2].text, /女性ヘルパー/);
  assert.equal(calls[3].table, "sharefull_content_policy_blocks");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].values.source_data)), {
    template_title: "訪問介護",
    work_description: "女性ヘルパー活躍中",
    env: { sukima_detail: "公開される文言" },
  });
});

test("本番で送信権を取得できない同時実行は通知しない", async () => {
  const { alert, calls } = loadAlert("production", { claimAvailable: false });
  const result = await alert.recordSharefullContentPolicyBlock({
    coreId: "core-1", source: "cron", sourceData: {},
    report: { status: "blocked", findings: [] },
  });

  assert.equal(result.recorded, true);
  assert.equal(result.notified, false);
  assert.equal(calls.some((call) => call.channelId), false);
});

test("LINE WORKS受理後の監査更新失敗は自動再送を保留する", async () => {
  const { alert, calls, record } = loadAlert("production", { failConfirmation: true });
  const input = { coreId: "core-1", source: "cron", sourceData: {}, report: { status: "blocked", findings: [] } };
  const first = await alert.recordSharefullContentPolicyBlock(input);
  const second = await alert.recordSharefullContentPolicyBlock(input);

  assert.equal(first.notified, false);
  assert.match(record.notification_error, /重複送信を避けるため自動再送を停止/);
  assert.equal(second.notified, false);
  assert.equal(calls.filter((call) => call.channelId).length, 1);
});

test("停止記録はテスト・本番で監査テーブルを分離する", async () => {
  const { alert, calls } = loadAlert("test");
  await alert.recordSharefullContentPolicyBlock({
    coreId: "core-1", source: "test", sourceData: {},
    report: { status: "blocked", findings: [] },
  });
  assert.equal(calls[0].table, "sharefull_rpa_test_content_policy_blocks");
});
