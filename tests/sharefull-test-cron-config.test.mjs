import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertSharefullDecisionMigrationApplied, assertSharefullTestCronRegistration, assertSharefullTestCronReleaseSource, buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON, writeSharefullTestVercelConfig } from "../scripts/sharefull-test-cron-config.mjs";

const sharedConfig = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const testOverrides = JSON.parse(await readFile(new URL("../vercel.test.json", import.meta.url), "utf8"));
const decisionMigration = await readFile(new URL("../supabase/migrations/202610011200_sharefull_decision_status_monitor.sql", import.meta.url), "utf8");
const monitorRoute = await readFile(new URL("../src/app/api/cron/sharefull-decision-status/route.ts", import.meta.url), "utf8");
const completionRoute = await readFile(new URL("../src/app/api/rpa/jobs/[id]/complete/route.ts", import.meta.url), "utf8");

test("既存テストCronを維持し、認証付きの応募決定監視だけを追加する", () => {
  const result = buildSharefullTestVercelConfig(sharedConfig, testOverrides);
  assert.deepEqual(result.crons.slice(0, sharedConfig.crons.length), sharedConfig.crons);
  assert.deepEqual(result.crons.at(-1), SHAREFULL_DECISION_CRON);
  assert.equal(result.crons.length, sharedConfig.crons.length + 1);
  assert.equal(result.buildCommand, testOverrides.buildCommand);
});

test("本番共有vercel.jsonへの監視Cron混入を拒否する", () => {
  assert.throws(() => buildSharefullTestVercelConfig({
    crons: [...sharedConfig.crons, SHAREFULL_DECISION_CRON],
  }, testOverrides), /must not be added to shared vercel\.json/);
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

test("一時デプロイ用ソースだけにCronを書き、共有設定オブジェクトは変更しない", async () => {
  const stagingRoot = await mkdtemp(join(tmpdir(), "sharefull-cron-staging-test-"));
  const sharedBefore = structuredClone(sharedConfig);
  try {
    const stagedConfigPath = await writeSharefullTestVercelConfig(stagingRoot, sharedConfig, testOverrides);
    const stagedConfig = JSON.parse(await readFile(stagedConfigPath, "utf8"));
    assert.equal(stagedConfig.crons.length, sharedConfig.crons.length + 1);
    assert.deepEqual(stagedConfig.crons.at(-1), SHAREFULL_DECISION_CRON);
    assert.deepEqual(sharedConfig, sharedBefore);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
});

test("Vercel Cron一覧で件数・対象Cron・テスト用ホストを確認する", () => {
  const listing = {
    crons: [
      ...sharedConfig.crons,
      { ...SHAREFULL_DECISION_CRON, host: "famille-shift-matching-test-abc-junkusanos-projects.vercel.app" },
    ],
  };
  assert.equal(assertSharefullTestCronRegistration(listing, sharedConfig.crons.length + 1), true);
  assert.throws(() => assertSharefullTestCronRegistration(listing, sharedConfig.crons.length), /Expected/);
  assert.throws(() => assertSharefullTestCronRegistration({ crons: [...listing.crons, listing.crons.at(-1)] }, sharedConfig.crons.length + 2), /missing, duplicated/);
  const wrongHost = structuredClone(listing);
  wrongHost.crons.at(-1).host = "famille-shift-matching-prod-abc.vercel.app";
  assert.throws(() => assertSharefullTestCronRegistration(wrongHost, sharedConfig.crons.length + 1), /missing, duplicated/);
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

test("決定ジョブがRunnerに紐づかない場合は完了APIが成功扱いしない", () => {
  assert.match(completionRoute, /if \(pendingNotifications === null\)[\s\S]*status: 409/);
});
