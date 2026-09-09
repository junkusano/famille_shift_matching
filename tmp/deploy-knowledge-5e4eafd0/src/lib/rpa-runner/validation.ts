export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function positiveInteger(value: unknown, maxValue: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maxValue ? value : null;
}

export function redactDebug(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactDebug(item, depth + 1));
  if (!isRecord(value)) return typeof value === 'string' ? value.slice(0, 1000) : value;
  return Object.fromEntries(Object.entries(value).slice(0, 50).map(([key, item]) => [
    key,
    /token|password|cookie|authorization/i.test(key) ? '[redacted]' : redactDebug(item, depth + 1),
  ]));
}
