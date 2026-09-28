import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadAlert() {
  const code = readFileSync(new URL("../src/lib/spot-sync/sharefullContentPolicyAlert.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const calls = [];
  const context = vm.createContext({
    exports: {},
    createHash,
    process: { env: { SHAREFULL_RPA_MODE: "test" } },
    sharefullRpaMode: () => "test",
    getAccessToken: async () => "token",
    sendLWBotMessage: async (channelId, text, token) => calls.push({ channelId, text, token }),
    supabaseAdmin: {
      from: () => {
        const builder = {
          upsert: () => builder,
          select: () => builder,
          single: async () => ({ data: { id: "block-1", notified_at: null }, error: null }),
          update: (values) => { calls.push({ type: "update", values }); return builder; },
          eq: () => builder,
          then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject),
        };
        return builder;
      },
    },
  });
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${output}\nexports.recordSharefullContentPolicyBlock = recordSharefullContentPolicyBlock;`, context);
  return { alert: context.exports, calls };
}

test("停止記録を保存してからLINE WORKSへ通知する", async () => {
  const { alert, calls } = loadAlert();
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
  assert.equal(calls[0].channelId, "99142491");
  assert.match(calls[0].text, /444578/);
  assert.match(calls[0].text, /女性の下着/);
  assert.equal(calls[0].token, "token");
  assert.equal(calls[1].type, "update");
});
