export type OpenAIProfileLevel =
  | "light"
  | "standard"
  | "heavy"
  | "critical";

export type OpenAIReasoningEffort =
  | "low"
  | "medium"
  | "high"
  | "xhigh";

type OpenAIProfile = Readonly<{
  model: string;
  reasoning: OpenAIReasoningEffort;
}>;

function resolveModel(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function resolveReasoningEffort(
  value: string | undefined,
  fallback: OpenAIReasoningEffort,
): OpenAIReasoningEffort {
  const normalized = value?.trim();

  switch (normalized) {
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return normalized;
    default:
      return fallback;
  }
}

export const OPENAI_PROFILES: Readonly<
  Record<OpenAIProfileLevel, OpenAIProfile>
> = {
  light: {
    model: resolveModel(process.env.OPENAI_MODEL_LIGHT, "gpt-5.6-luna"),
    reasoning: resolveReasoningEffort(
      process.env.OPENAI_REASONING_LIGHT,
      "low",
    ),
  },
  standard: {
    model: resolveModel(process.env.OPENAI_MODEL_STANDARD, "gpt-5.6-terra"),
    reasoning: resolveReasoningEffort(
      process.env.OPENAI_REASONING_STANDARD,
      "medium",
    ),
  },
  heavy: {
    model: resolveModel(process.env.OPENAI_MODEL_HEAVY, "gpt-5.6-sol"),
    reasoning: resolveReasoningEffort(
      process.env.OPENAI_REASONING_HEAVY,
      "high",
    ),
  },
  critical: {
    model: resolveModel(process.env.OPENAI_MODEL_CRITICAL, "gpt-5.6-sol"),
    reasoning: resolveReasoningEffort(
      process.env.OPENAI_REASONING_CRITICAL,
      "xhigh",
    ),
  },
};
