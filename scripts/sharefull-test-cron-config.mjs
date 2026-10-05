export const SHAREFULL_DECISION_CRON = Object.freeze({
  path: "/api/cron/sharefull-decision-status",
  schedule: "*/5 * * * *",
});

export function assertSharefullDecisionMigrationApplied(env = process.env) {
  if (env.SHAREFULL_DECISION_MIGRATION_APPLIED?.trim().toLowerCase() !== "true") {
    throw new Error("Refusing deployment: apply and verify the Sharefull test decision migration first");
  }
}

export function buildSharefullTestVercelConfig(sharedConfig, testOverrides = {}, decisionToken) {
  if (!Array.isArray(sharedConfig?.crons)) {
    throw new Error("Shared vercel.json must contain the existing cron array");
  }
  if (sharedConfig.crons.some((cron) => cron?.path === SHAREFULL_DECISION_CRON.path)) {
    throw new Error("The test-only decision cron must not be added to shared vercel.json");
  }

  if (typeof decisionToken !== "string" || decisionToken.length < 32) {
    throw new Error("A dedicated Sharefull decision cron token of at least 32 characters is required");
  }

  // Do not configure project-wide CRON_SECRET: Vercel sends that value to
  // every cron route in the project. Use a per-route query token instead.
  const decisionCron = {
    ...SHAREFULL_DECISION_CRON,
    path: `${SHAREFULL_DECISION_CRON.path}?decision_token=${encodeURIComponent(decisionToken)}`,
  };
  return {
    ...sharedConfig,
    ...testOverrides,
    crons: [...sharedConfig.crons, decisionCron],
  };
}
