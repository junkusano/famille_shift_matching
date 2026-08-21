export type PlanGenerationSourceAvailability = {
  carePlan: boolean;
  basicInfo: boolean;
  servicePlan: boolean;
  meetingMinutes: boolean;
  assessment: boolean;
  visitNotes: boolean;
};

export type SelectedPlanSource =
  | "care_plan"
  | "service_plan"
  | "basic_info"
  | "meeting_minutes"
  | "none";

export type PlanGenerationSourcePolicy = {
  canGenerate: boolean;
  selectedPlanSource: SelectedPlanSource;
  error: string | null;
};

const ELDER_CARE_SOURCE_ERROR =
  "訪問介護計画の生成に必要なケアプランを取得できませんでした。";

const DISABILITY_SOURCE_ERROR =
  "基本情報、サービス等利用計画、担当者会議議事録のいずれも無いため、プランを自動生成できません。";

/**
 * 訪問介護計画の生成可否をサービス体系ごとに判定する。
 *
 * 介護保険ではケアプランを主要かつ必須の根拠とする。
 * 障害福祉・移動支援では従来どおり、基本情報・サービス等利用計画・
 * 担当者会議議事録のいずれかを根拠とする。
 */
export function resolvePlanGenerationSourcePolicy(params: {
  isElderCare: boolean;
  availability: PlanGenerationSourceAvailability;
}): PlanGenerationSourcePolicy {
  const { isElderCare, availability } = params;

  if (isElderCare) {
    return availability.carePlan
      ? {
          canGenerate: true,
          selectedPlanSource: "care_plan",
          error: null,
        }
      : {
          canGenerate: false,
          selectedPlanSource: "none",
          error: ELDER_CARE_SOURCE_ERROR,
        };
  }

  if (availability.servicePlan) {
    return {
      canGenerate: true,
      selectedPlanSource: "service_plan",
      error: null,
    };
  }

  if (availability.basicInfo) {
    return {
      canGenerate: true,
      selectedPlanSource: "basic_info",
      error: null,
    };
  }

  if (availability.meetingMinutes) {
    return {
      canGenerate: true,
      selectedPlanSource: "meeting_minutes",
      error: null,
    };
  }

  return {
    canGenerate: false,
    selectedPlanSource: "none",
    error: DISABILITY_SOURCE_ERROR,
  };
}
