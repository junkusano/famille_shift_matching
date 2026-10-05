import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/spot-sync/sharefullDecisionBatch.ts", import.meta.url), "utf8");
const context = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { sharefullDecisionBatch } = context.exports;

test("1,000件を超えても全ページを30件ずつ巡回する", () => {
  assert.deepEqual({ ...sharefullDecisionBatch(2_001, 66) }, {
    batchCount: 67,
    batchIndex: 66,
    from: 1_980,
    to: 2_009,
  });
  assert.deepEqual({ ...sharefullDecisionBatch(2_001, 67) }, {
    batchCount: 67,
    batchIndex: 0,
    from: 0,
    to: 29,
  });
});

test("0件でも有効な範囲を返し、入力不正を拒否する", () => {
  assert.deepEqual({ ...sharefullDecisionBatch(0, 0) }, { batchCount: 1, batchIndex: 0, from: 0, to: 29 });
  assert.throws(() => sharefullDecisionBatch(-1, 0), /non-negative safe integer/);
  assert.throws(() => sharefullDecisionBatch(10, 0, 0), /positive safe integer/);
});
