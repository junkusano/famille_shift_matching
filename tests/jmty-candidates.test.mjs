import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/spot-offer/jmtyCandidates.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({ exports: {} });
vm.runInContext(output, context);
const { buildJmtyCandidates } = context.exports;

const request = (overrides = {}) => ({
  id: "request-1", core_id: "core-1", shift_start_date: "2026-10-20", shift_start_time: "09:00",
  shift_end_time: "12:00", unit_amount: 6000, commute_fee: 500, jmty_status: null, sharefull_job_id: null,
  ...overrides,
});
const template = (overrides = {}) => ({
  core_id: "core-1", jmty_template_status: "ready_for_offer", template_title: "訪問介護スタッフ",
  work_description: "タイミーから取得した募集文面", matching_place_name: "愛知県名古屋市千種区1-2-3 052-123-4567",
  ...overrides,
});

test("承認済み文面がある未来の募集のみを最小情報で候補表示する", () => {
  const [candidate] = buildJmtyCandidates([request()], [template()], "2026-10-15");
  assert.equal(candidate.title, "訪問介護スタッフ");
  assert.equal(candidate.workplace_summary, "愛知県名古屋市周辺");
  assert.equal(candidate.recruitment_summary, "2026-10-20｜09:00〜12:00｜支給額 6,000円｜交通費 500円");
  assert.equal(candidate.status, "未掲載");
  assert.doesNotMatch(JSON.stringify(candidate), /1-2-3|052-123-4567|core-1/);
});

test("承認前、文面不足、終了案件、Sharefull掲載済み案件を除外する", () => {
  const result = buildJmtyCandidates([
    request(),
    request({ id: "review", core_id: "core-review" }),
    request({ id: "listed", jmty_status: "published" }),
    request({ id: "past", shift_start_date: "2026-10-14" }),
    request({ id: "sharefull", sharefull_job_id: "sf-1" }),
  ], [
    template(),
    template({ core_id: "core-review", jmty_template_status: "template_review" }),
    template({ core_id: "core-empty", work_description: "  " }),
  ], "2026-10-15");
  assert.deepEqual(Array.from(result, (item) => item.id), ["request-1"]);
});

test("APIは読み取り専用で掲載ジョブ登録を行わない", () => {
  const route = readFileSync(new URL("../src/app/api/rpa/jmty/candidates/route.ts", import.meta.url), "utf8");
  assert.match(route, /read_only:\s*true/);
  assert.doesNotMatch(route, /\.insert\s*\(|\.update\s*\(|rpa_runner_jobs|enqueue.*Job/i);
});
