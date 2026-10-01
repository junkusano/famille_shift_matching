import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "./sharefull-test-cron-config.mjs";

const projectName = "famille-shift-matching-test";
const teamScope = "junkusanos-projects";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedConfig = JSON.parse(await readFile(join(repoRoot, "vercel.json"), "utf8"));
const testOverrides = JSON.parse(await readFile(join(repoRoot, "vercel.test.json"), "utf8"));
const decisionToken = process.env.SHAREFULL_DECISION_CRON_TOKEN;
const deployConfig = buildSharefullTestVercelConfig(sharedConfig, testOverrides, decisionToken);
const rootConfigPath = join(repoRoot, "vercel.json");
const originalRootConfig = await readFile(rootConfigPath);
const generatedRootConfig = Buffer.from(`${JSON.stringify(deployConfig, null, 2)}\n`, "utf8");
let rootConfigTemporarilyReplaced = false;

try {
  const addedCron = deployConfig.crons.at(-1);
  if (deployConfig.crons.length !== sharedConfig.crons.length + 1
    || !addedCron?.path.startsWith(`${SHAREFULL_DECISION_CRON.path}/`)
    || deployConfig.crons.slice(0, -1).some((cron, index) => JSON.stringify(cron) !== JSON.stringify(sharedConfig.crons[index]))) {
    throw new Error("Refusing deployment: preserve existing crons and add only the tokenized test decision cron");
  }
  console.log(`Deploying ${deployConfig.crons.length} schedules to test project ${projectName}; preserving its ${sharedConfig.crons.length} existing schedules.`);
  console.log(`Only ${SHAREFULL_DECISION_CRON.path} is added. No project-wide CRON_SECRET is configured by this script.`);

  // Cron registration is derived from the vercel.json included in the upload.
  // Temporarily put the test-only config at that canonical path, then restore
  // the exact original bytes even if deployment fails.
  await writeFile(rootConfigPath, generatedRootConfig);
  rootConfigTemporarilyReplaced = true;

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npx, [
    "--yes", "vercel@latest", "deploy", "--prod",
    "--project", projectName,
    "--scope", teamScope,
  ], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Vercel CLI terminated by ${result.signal}`);
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  if (rootConfigTemporarilyReplaced) {
    const currentRootConfig = await readFile(rootConfigPath);
    if (!currentRootConfig.equals(generatedRootConfig)) {
      throw new Error("Refusing to restore vercel.json because it changed during deployment; preserve the concurrent change and recover the original config manually.");
    }
    await writeFile(rootConfigPath, originalRootConfig);
  }
}
