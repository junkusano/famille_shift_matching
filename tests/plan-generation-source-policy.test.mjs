import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlanGenerationSourcePolicy } from "../src/lib/plans/generation-source-policy.ts";

const emptyAvailability = {
  carePlan: false,
  basicInfo: false,
  servicePlan: false,
  meetingMinutes: false,
  assessment: false,
  visitNotes: false,
};

test("要支援はケアプランだけで生成できる", () => {
  const result = resolvePlanGenerationSourcePolicy({
    isElderCare: true,
    availability: { ...emptyAvailability, carePlan: true },
  });

  assert.equal(result.canGenerate, true);
  assert.equal(result.selectedPlanSource, "care_plan");
});

test("要介護もケアプランがあれば生成できる", () => {
  const result = resolvePlanGenerationSourcePolicy({
    isElderCare: true,
    availability: { ...emptyAvailability, carePlan: true },
  });

  assert.equal(result.canGenerate, true);
  assert.equal(result.selectedPlanSource, "care_plan");
});

test("介護保険でケアプランがなければ介護保険向けエラーになる", () => {
  const result = resolvePlanGenerationSourcePolicy({
    isElderCare: true,
    availability: {
      ...emptyAvailability,
      basicInfo: true,
      meetingMinutes: true,
    },
  });

  assert.equal(result.canGenerate, false);
  assert.match(result.error ?? "", /ケアプラン/);
  assert.doesNotMatch(result.error ?? "", /サービス等利用計画/);
});

test("障害福祉はサービス等利用計画があれば従来どおり生成できる", () => {
  const result = resolvePlanGenerationSourcePolicy({
    isElderCare: false,
    availability: { ...emptyAvailability, servicePlan: true },
  });

  assert.equal(result.canGenerate, true);
  assert.equal(result.selectedPlanSource, "service_plan");
});

test("障害福祉で必要資料がなければ従来の不足資料エラーになる", () => {
  const result = resolvePlanGenerationSourcePolicy({
    isElderCare: false,
    availability: emptyAvailability,
  });

  assert.equal(result.canGenerate, false);
  assert.match(result.error ?? "", /サービス等利用計画/);
});
