const SECRET_KEY_PATTERN = /(authorization|password|secret|token|private.?key|app.?password|cookie|api.?key)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_PATTERN = /Basic\s+[A-Za-z0-9+/=]+/gi;
const PEM_PATTERN = /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (typeof value === "string") {
    return value
      .replace(BEARER_PATTERN, "Bearer [REDACTED]")
      .replace(BASIC_PATTERN, "Basic [REDACTED]")
      .replace(PEM_PATTERN, "[REDACTED_PEM]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(item, depth + 1);
    }
    return output;
  }
  return value;
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return String(redact(message)).slice(0, 2_000);
}
