export const SHAREFULL_DECISION_CRON = Object.freeze({
  path: "/api/cron/sharefull-decision-status",
  schedule: "*/5 * * * *",
});

export function assertSharefullDecisionMigrationApplied(env = process.env) {
  if (env.SHAREFULL_DECISION_MIGRATION_APPLIED?.trim().toLowerCase() !== "true") {
    throw new Error("Refusing deployment: apply and verify the Sharefull test decision migration first");
  }
}

export function assertSharefullTestCronReleaseSource({ headSha, originMasterSha, worktreeStatus, originUrl }) {
  const allowedOrigins = new Set([
    "https://github.com/junkusano/famille_shift_matching.git",
    "https://github.com/junkusano/famille_shift_matching",
    "git@github.com:junkusano/famille_shift_matching.git",
    "ssh://git@github.com/junkusano/famille_shift_matching.git",
  ]);
  if (!allowedOrigins.has(originUrl)) {
    throw new Error("Refusing deployment: origin is not the canonical MyFamille repository");
  }
  if (!headSha || headSha !== originMasterSha) {
    throw new Error("Refusing deployment: checkout must match the fetched origin/master commit");
  }
  if (worktreeStatus) {
    throw new Error("Refusing deployment: working tree must be clean, including untracked files");
  }
}

export function buildSharefullTestVercelConfig(sharedConfig, testOverrides = {}) {
  if (!Array.isArray(sharedConfig?.crons)) {
    throw new Error("Shared vercel.json must contain the existing cron array");
  }
  if (sharedConfig.crons.some((cron) => cron?.path === SHAREFULL_DECISION_CRON.path)) {
    throw new Error("The test-only decision cron must not be added to shared vercel.json");
  }

  return {
    ...sharedConfig,
    ...testOverrides,
    crons: [...sharedConfig.crons, SHAREFULL_DECISION_CRON],
  };
}
