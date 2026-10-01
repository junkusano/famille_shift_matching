export const SHAREFULL_DECISION_CRON = Object.freeze({
  path: "/api/cron/sharefull-decision-status",
  schedule: "*/5 * * * *",
});

export function buildSharefullTestVercelConfig(sharedConfig, testOverrides = {}) {
  if (!Array.isArray(sharedConfig?.crons)) {
    throw new Error("Shared vercel.json must contain the existing cron array");
  }
  if (sharedConfig.crons.some((cron) => cron?.path === SHAREFULL_DECISION_CRON.path)) {
    throw new Error("The test-only decision cron must not be added to shared vercel.json");
  }

  // Vercel's CRON_SECRET is project-wide. Keep this project deliberately
  // isolated so that it cannot activate authentication/behavior for any of
  // the legacy schedules in the main test project.
  return {
    ...testOverrides,
    crons: [{ ...SHAREFULL_DECISION_CRON }],
  };
}
