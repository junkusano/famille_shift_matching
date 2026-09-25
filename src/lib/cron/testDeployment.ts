/** Safety switch used by the separate Sharefull test deployment. */
export function isSharefullTestDeployment(): boolean {
  return process.env.SHAREFULL_TEST_DEPLOYMENT?.trim().toLowerCase() === "true";
}

export function areSharefullAutomationCronsEnabled(): boolean {
  if (!isSharefullTestDeployment()) return true;
  return process.env.SHAREFULL_AUTOMATION_CRONS_ENABLED?.trim().toLowerCase() === "true";
}

export function testDeploymentCronSkippedResponse() {
  return {
    ok: true as const,
    skipped: true as const,
    reason: "sharefull_test_deployment_crons_disabled" as const,
  };
}
