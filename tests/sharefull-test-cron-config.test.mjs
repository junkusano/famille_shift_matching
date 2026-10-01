import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "../scripts/sharefull-test-cron-config.mjs";

const sharedConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const testOverrides = JSON.parse(await readFile(new URL("../vercel.test.json", import.meta.url), "utf8"));

test("隔離テスト用Cron設定は応募決定監視だけを含む", () => {
  const result = buildSharefullTestVercelConfig(sharedConfig, testOverrides);
  assert.deepEqual(result.crons, [SHAREFULL_DECISION_CRON]);
  assert.equal(result.crons.length, 1);
  assert.equal(result.buildCommand, testOverrides.buildCommand);
});

test("本番共有vercel.jsonへの監視Cron混入を拒否する", () => {
  assert.throws(() => buildSharefullTestVercelConfig({
    crons: [...sharedConfig.crons, SHAREFULL_DECISION_CRON],
  }), /must not be added to shared vercel\.json/);
});
