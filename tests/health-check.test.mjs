import assert from "node:assert/strict";
import test from "node:test";
import { isHealthCheckRequestSubmitted } from "../src/lib/healthCheck.ts";

test("health-check draft with a result attachment counts as submitted", () => {
  assert.equal(isHealthCheckRequestSubmitted("draft", true), true);
});

test("health-check draft without a result attachment remains unsubmitted", () => {
  assert.equal(isHealthCheckRequestSubmitted("draft", false), false);
});

test("non-draft submitted statuses preserve existing behavior", () => {
  assert.equal(isHealthCheckRequestSubmitted("submitted", false), true);
  assert.equal(isHealthCheckRequestSubmitted("approved", false), true);
  assert.equal(isHealthCheckRequestSubmitted("completed", false), true);
  assert.equal(isHealthCheckRequestSubmitted("rejected", true), false);
});
