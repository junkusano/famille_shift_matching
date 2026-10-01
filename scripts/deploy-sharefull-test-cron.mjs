import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSharefullTestVercelConfig, SHAREFULL_DECISION_CRON } from "./sharefull-test-cron-config.mjs";

const projectName = "famille-shift-matching-test";
const teamScope = "junkusanos-projects";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sharedConfig = JSON.parse(await readFile(join(repoRoot, "vercel.json"), "utf8"));
const testOverrides = JSON.parse(await readFile(join(repoRoot, "vercel.test.json"), "utf8"));
const deployConfig = buildSharefullTestVercelConfig(sharedConfig, testOverrides);
const tempDirectory = await mkdtemp(join(tmpdir(), "myfamille-sharefull-test-cron-"));
const localConfigPath = join(tempDirectory, "vercel.test.generated.json");

try {
  await writeFile(localConfigPath, `${JSON.stringify(deployConfig, null, 2)}\n`, "utf8");
  console.log(`Deploying ${deployConfig.crons.length} schedules to test project ${projectName}.`);
  console.log(`The ${sharedConfig.crons.length} shared schedules are preserved; only ${SHAREFULL_DECISION_CRON.path} is added.`);

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
