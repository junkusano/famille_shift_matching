import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadPolicy() {
  const code = readFileSync(new URL("../src/lib/spot-sync/sharefullContentPolicy.ts", import.meta.url), "utf8");
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ exports: {} });
  vm.runInContext(output, context);
  return context.exports;
}

const { applySharefullContentPolicy } = loadPolicy();

test("公開本文のタイミー表記とURLをシェアフル表記へ変換する", () => {
  const source = {
    template_title: "訪問介護",
    work_description: "🌱タイミー掲載のお仕事はごく一部です！ Timee https://timee.co.jp/jobs/123",
  };

  const result = applySharefullContentPolicy(source);

  assert.equal(result.report.status, "transformed");
  assert.equal(result.data.work_description, "🌱シェアフル掲載のお仕事はごく一部です！ Sharefull https://sharefull.com/");
  assert.equal(result.report.findings.length, 3);
  assert.equal(result.report.findings[0].ruleId, "taimee-listing-banner");
});

test("性別に関する要確認文言は記録対象にするが掲載は止めない", () => {
  const result = applySharefullContentPolicy({
    template_title: "女性ヘルパー活躍中",
    work_description: "女性の下着の洗濯等あるため応募には考慮お願いします。",
  });

  assert.equal(result.report.status, "flagged");
  assert.ok(result.report.findings.some((finding) => finding.ruleId === "gender-sensitive-recruiting" && finding.action === "flag"));
});

test("非公開の管理情報は変更せず、入力データも破壊しない", () => {
  const source = {
    timee_job_id: "timee-123",
    internal_label: "タイミー内部管理用",
    work_description: "🌱タイミー掲載のお仕事はごく一部です！",
    env: { sukima_detail: "タイミー掲載のお仕事はごく一部です！" },
  };
  const before = structuredClone(source);

  const result = applySharefullContentPolicy(source);

  assert.deepEqual(source, before);
  assert.equal(result.data.timee_job_id, "timee-123");
  assert.equal(result.data.internal_label, "タイミー内部管理用");
  assert.equal(result.data.env.sukima_detail, "シェアフル掲載のお仕事はごく一部です！");
});
