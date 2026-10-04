import { safeErrorMessage } from "@/lib/security/redaction";

export function okResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function errorResult(error: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: safeErrorMessage(error) }],
  };
}
