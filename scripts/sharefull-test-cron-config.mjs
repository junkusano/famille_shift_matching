export const SHAREFULL_DECISION_CRON = Object.freeze({
  path: "/api/cron/sharefull-decision-status",
  schedule: "*/5 * * * *",
});

export function buildSharefullTestVercelConfig(sharedConfig, testOverrides = {}, decisionToken) {
  if (!Array.isArray(sharedConfig?.crons)) {
    throw new Error("Shared vercel.json must contain the existing cron array");
  }
  if (sharedConfig.crons.some((cron) => cron?.path === SHAREFULL_DECISION_CRON.path)) {
    throw new Error("The test-only decision cron must not be added to shared vercel.json");
  }

  if (typeof decisionToken !== "string" || !/^[a-f0-9]{64}$/.test(decisionToken)) {
    throw new Error("A dedicated Sharefull decision cron token must be 64 lowercase hexadecimal characters");
  }

  // Do not configure project-wide CRON_SECRET: Vercel sends that value to
  // every cron route in the project. The tokenized URL is handled by a real
  // dynamic App Router endpoint, so no rewrite or query string is needed.
  const decisionPath = `${SHAREFULL_DECISION_CRON.path}/${decisionToken}`;
  const decisionCron = {
    ...SHAREFULL_DECISION_CRON,
    path: decisionPath,
  };
  return {
    ...sharedConfig,
    ...testOverrides,
    rewrites: [
      ...(sharedConfig.rewrites ?? []),
      ...(testOverrides.rewrites ?? []),
    ],
    crons: [...sharedConfig.crons, decisionCron],
  };
}
