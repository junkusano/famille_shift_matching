import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "../scripts/sharefull-test-cron-config.mjs";

const sharedConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const testOverrides = JSON.parse(await readFile(new URL("../vercel.test.json", import.meta.url), "utf8"));

const token = "x".repeat(48);

test("既存テストCronを維持し、認証付きの応募決定監視だけを追加する", () => {
  const result = buildSharefullTestVercelConfig(sharedConfig, testOverrides, token);
  assert.deepEqual(result.crons.slice(0, sharedConfig.crons.length), sharedConfig.crons);
  assert.deepEqual(result.crons.at(-1), {
    ...SHAREFULL_DECISION_CRON,
    path: `${SHAREFULL_DECISION_CRON.path}?decision_token=${token}`,
  });
  assert.equal(result.crons.length, sharedConfig.crons.length + 1);
  assert.equal(result.buildCommand, testOverrides.buildCommand);
});

test("短すぎるルート認証トークンを拒否する", () => {
  assert.throws(() => buildSharefullTestVercelConfig(sharedConfig, testOverrides, "short"), /at least 32 characters/);
});

test("本番共有vercel.jsonへの監視Cron混入を拒否する", () => {
  assert.throws(() => buildSharefullTestVercelConfig({
    crons: [...sharedConfig.crons, SHAREFULL_DECISION_CRON],
  }, testOverrides, token), /must not be added to shared vercel\.json/);
});
