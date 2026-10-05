import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertSharefullDecisionMigrationApplied, assertSharefullTestCronReleaseSource, buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "../scripts/sharefull-test-cron-config.mjs";

const sharedConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const testOverrides = JSON.parse(await readFile(new URL("../vercel.test.json", import.meta.url), "utf8"));
const decisionMigration = await readFile(new URL("../supabase/migrations/202610011200_sharefull_decision_status_monitor.sql", import.meta.url), "utf8");
const monitorRoute = await readFile(new URL("../src/app/api/cron/sharefull-decision-status/route.ts", import.meta.url), "utf8");

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

test("DBマイグレーション適用の確認がない状態ではCronデプロイを拒否する", () => {
  assert.throws(
    () => assertSharefullDecisionMigrationApplied({ SHAREFULL_DECISION_MIGRATION_APPLIED: "false" }),
    /apply and verify the Sharefull test decision migration first/,
  );
  assert.doesNotThrow(() => assertSharefullDecisionMigrationApplied({ SHAREFULL_DECISION_MIGRATION_APPLIED: "true" }));
});

test("共有vercel.jsonには決定監視Cronを登録しない", () => {
  assert.equal(sharedConfig.crons.some((cron) => cron.path === SHAREFULL_DECISION_CRON.path), false);
});

test("監視マイグレーションはテスト専用テーブルと関数だけを追加する", () => {
  assert.match(decisionMigration, /create table if not exists public\.sharefull_rpa_test_decision_status/i);
  assert.match(decisionMigration, /function public\.complete_sharefull_test_decision_check/i);
  assert.match(decisionMigration, /j\.payload->>'environment' is distinct from 'test'/i);
  assert.doesNotMatch(decisionMigration, /function public\.complete_sharefull_decision_check\s*\(/i);
  assert.doesNotMatch(decisionMigration, /public\.spot_offer_request_table\b/i);
});

test("テストCronのDeployは正規origin/masterのクリーンな作業ツリーだけに許可する", () => {
  const source = {
    originUrl: "https://github.com/junkusano/famille_shift_matching.git",
    headSha: "abc123",
    originMasterSha: "abc123",
    worktreeStatus: "",
  };
  assert.doesNotThrow(() => assertSharefullTestCronReleaseSource(source));
  assert.throws(() => assertSharefullTestCronReleaseSource({ ...source, originUrl: "https://example.com/fork.git" }), /canonical MyFamille repository/);
  assert.throws(() => assertSharefullTestCronReleaseSource({ ...source, headSha: "old123" }), /fetched origin\/master commit/);
  assert.throws(() => assertSharefullTestCronReleaseSource({ ...source, worktreeStatus: "?? untracked.txt" }), /working tree must be clean/);
});

test("DBの読取専用準備確認より前に共有ジョブを登録しない", () => {
  const tableProbe = monitorRoute.indexOf(".limit(0)");
  const rpcProbe = monitorRoute.indexOf('"complete_sharefull_test_decision_check"');
  const enqueue = monitorRoute.indexOf('.from("rpa_runner_jobs").insert({');
  assert.ok(tableProbe >= 0 && rpcProbe >= 0 && enqueue >= 0);
  assert.ok(tableProbe < enqueue);
  assert.ok(rpcProbe < enqueue);
});
