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

test("Sharefull同期は初期値で検証利用者だけを対象にする", () => {
  const scope = loadScope();
  assert.deepEqual([...scope.sharefullSyncClientIds()], ["12782561"]);
  assert.equal(scope.isSharefullSyncClient("12782561"), true);
  assert.equal(scope.isSharefullSyncClient("99999999"), false);
});

test("全利用者化には対象指定と明示許可の両方を必要とする", () => {
  const blocked = loadScope({ SHAREFULL_SYNC_KAIPOKE_CS_IDS: "*" });
  assert.deepEqual([...blocked.sharefullSyncClientIds()], ["12782561"]);

  const allowed = loadScope({
    SHAREFULL_SYNC_KAIPOKE_CS_IDS: "*",
    SHAREFULL_SYNC_ALLOW_ALL: "true",
  });
  assert.equal(allowed.sharefullSyncClientIds(), null);
  assert.equal(allowed.isSharefullSyncClient("99999999"), true);
});
