import { httpsBaseUrl, requiredEnv } from "@/lib/config";
import { fetchJson, UpstreamError } from "@/lib/http";

export function wordpressApiUrl(path: string): string {
  return `${httpsBaseUrl("WORDPRESS_URL")}/wp-json/wp/v2${path}`;
}

export function wordpressAuthHeader(): string {
  const username = requiredEnv("WORDPRESS_USERNAME");
  const password = requiredEnv("WORDPRESS_APP_PASSWORD").replace(/\s+/g, "");
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

export async function wordpressRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetchJson<T>("WordPress", wordpressApiUrl(path), {
    ...init,
    headers: {
      Authorization: wordpressAuthHeader(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  }, 30_000);
}

export async function wordpressUploadMedia(input: {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  altText?: string;
}): Promise<Record<string, unknown>> {
  const response = await fetch(wordpressApiUrl("/media"), {
    method: "POST",
    headers: {
      Authorization: wordpressAuthHeader(),
      "Content-Type": input.mimeType,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(input.filename)}"`,
    },
    body: input.bytes,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const text = await response.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; }
  catch { body = { message: text.slice(0, 2_000) }; }
  if (!response.ok) {
    throw new UpstreamError("WordPress", response.status, String(body.message ?? `HTTP ${response.status}`));
  }
  if (input.altText && body.id) {
    return wordpressRequest<Record<string, unknown>>(`/media/${body.id}`, {
      method: "POST",
      body: JSON.stringify({ alt_text: input.altText }),
    });
  }
  return body;
}

function sanitizeFilename(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  if (!safe) throw new Error("Invalid media filename");
  return safe.slice(0, 180);
}
