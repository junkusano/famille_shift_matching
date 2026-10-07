import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSharefullDecisionMigrationApplied, assertSharefullTestCronReleaseSource, buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "./sharefull-test-cron-config.mjs";

const projectName = "famille-shift-matching-test";
const teamScope = "junkusanos-projects";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function gitOutput(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Git preflight failed: git ${args[0]}`);
  return result.stdout.trim();
}

const originUrl = gitOutput(["remote", "get-url", "origin"]);
gitOutput(["fetch", "origin", "master"]);
assertSharefullTestCronReleaseSource({
  originUrl,
  headSha: gitOutput(["rev-parse", "HEAD"]),
  originMasterSha: gitOutput(["rev-parse", "refs/remotes/origin/master"]),
  worktreeStatus: gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]),
});

const sharedConfig = JSON.parse(await readFile(join(repoRoot, "vercel.json"), "utf8"));
const testOverrides = JSON.parse(await readFile(join(repoRoot, "vercel.test.json"), "utf8"));
assertSharefullDecisionMigrationApplied(process.env);
const deployConfig = buildSharefullTestVercelConfig(sharedConfig, testOverrides);
const tempDirectory = await mkdtemp(join(tmpdir(), "myfamille-sharefull-test-cron-"));
const localConfigPath = join(tempDirectory, "vercel.test.generated.json");

try {
  await writeFile(localConfigPath, `${JSON.stringify(deployConfig, null, 2)}\n`, "utf8");
  const addedCron = deployConfig.crons.at(-1);
  if (deployConfig.crons.length !== sharedConfig.crons.length + 1
    || addedCron?.path !== SHAREFULL_DECISION_CRON.path
    || deployConfig.crons.slice(0, -1).some((cron, index) => JSON.stringify(cron) !== JSON.stringify(sharedConfig.crons[index]))) {
    throw new Error("Refusing deployment: preserve the test project's existing crons and add only the decision monitor cron");
  }
  console.log(`Deploying ${deployConfig.crons.length} schedules to test project ${projectName}; preserving its ${sharedConfig.crons.length} existing schedules.`);
  console.log(`Only ${SHAREFULL_DECISION_CRON.path} is added. Cron authentication uses the test project's CRON_SECRET header; no secret is embedded in the URL.`);

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, [
    "--yes", "vercel@latest", "deploy", "--prod",
    "--project", projectName,
    "--scope", teamScope,
    "--local-config", localConfigPath,
  ], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Vercel CLI terminated by ${result.signal}`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}
