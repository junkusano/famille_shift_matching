import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadDedupe() {
  const code = readFileSync(new URL("../src/lib/spot-offer/publicationJobDedupe.ts", import.meta.url), "utf8");
  const context = vm.createContext({ exports: {} });
  vm.runInContext(ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

test("failed/cancelledの掲載履歴も同じ操作キーを重複扱いにする", () => {
  const dedupe = loadDedupe();
  const jobs = [
    { status: "failed", payload: { operation_key: "publish:1", spot_offer_request_id: "request-1" } },
    { status: "cancelled", payload: { operation_key: "publish:2", spot_offer_request_id: "request-2" } },
  ];

  assert.equal(dedupe.isDuplicateSharefullPublicationJob(jobs, "publish:1", "other"), true);
  assert.equal(dedupe.isDuplicateSharefullPublicationJob(jobs, "new-key", "request-2"), false);
  assert.equal(dedupe.isDuplicateSharefullPublicationJob(jobs, "new-key", "new-request"), false);
});

test("実行中の同一案件は操作キーが変わっても二重登録しない", () => {
  const dedupe = loadDedupe();
  const jobs = [{ status: "claimed", payload: { operation_key: "publish:old", spot_offer_request_id: "request-1" } }];
  assert.equal(dedupe.isDuplicateSharefullPublicationJob(jobs, "publish:new", "request-1"), true);
});

test("掲載ジョブの重複判定対象に全履歴状態を含める", () => {
  const dedupe = loadDedupe();
  assert.deepEqual([...dedupe.SHAREFULL_PUBLICATION_DEDUPE_STATUSES], [
    "pending", "claimed", "completed", "failed", "cancelled",
  ]);
});
