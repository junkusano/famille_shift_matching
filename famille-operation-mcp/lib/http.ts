const DEFAULT_TIMEOUT_MS = 20_000;

export class UpstreamError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(
  service: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 2_000);
  }
  if (!response.ok) {
    const message = extractErrorMessage(body) ?? `${service} request failed with HTTP ${response.status}`;
    throw new UpstreamError(service, response.status, message, body);
  }
  return body as T;
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error", "code"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return undefined;
}
