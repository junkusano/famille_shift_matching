import { requiredEnv, vercelConfig } from "@/lib/config";
import { fetchJson, UpstreamError } from "@/lib/http";

const VERCEL_API = "https://api.vercel.com";

export async function vercelRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const { teamId } = vercelConfig();
  return fetchJson<T>("Vercel", `${VERCEL_API}${path}${separator}teamId=${encodeURIComponent(teamId)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredEnv("VERCEL_TOKEN")}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  }, 30_000);
}

export async function vercelStreamRequest(path: string): Promise<unknown[]> {
  const separator = path.includes("?") ? "&" : "?";
  const { teamId } = vercelConfig();
  const response = await fetch(`${VERCEL_API}${path}${separator}teamId=${encodeURIComponent(teamId)}`, {
    headers: { Authorization: `Bearer ${requiredEnv("VERCEL_TOKEN")}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new UpstreamError("Vercel", response.status, `Vercel request failed with HTTP ${response.status}`);
  if (!text.trim()) return [];
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [value];
  } catch {
    return text.split(/\r?\n/).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return { message: line.slice(0, 2_000) }; }
    });
  }
}
