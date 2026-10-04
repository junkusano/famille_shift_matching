import { createSign } from "node:crypto";
import { fetchJson, UpstreamError } from "@/lib/http";
import { optionalEnv, requiredEnv, repositoryConfig } from "@/lib/config";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2026-03-10";

type CachedToken = { value: string; expiresAt: number };
let cachedInstallationToken: CachedToken | undefined;

export async function githubRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await githubAccessToken();
  return fetchJson<T>("GitHub", `${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "famille-operation-mcp",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

export function repoPath(suffix = ""): string {
  const { owner, repo } = repositoryConfig();
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
}

export async function getBranchHead(branch: string): Promise<string> {
  const data = await githubRequest<{ object: { sha: string } }>(
    repoPath(`/git/ref/heads/${encodeURIComponent(branch)}`),
  );
  return data.object.sha;
}

export async function getFileAtRef(path: string, ref: string): Promise<{
  path: string;
  sha: string;
  content: string;
  encoding: string;
  size: number;
} | null> {
  try {
    const data = await githubRequest<{
      type: string;
      path: string;
      sha: string;
      content: string;
      encoding: string;
      size: number;
    }>(repoPath(`/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(ref)}`));
    if (data.type !== "file") throw new Error("Requested GitHub path is not a file");
    const content = data.encoding === "base64"
      ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      : data.content;
    return { path: data.path, sha: data.sha, content, encoding: data.encoding, size: data.size };
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return null;
    throw error;
  }
}

export function assertAllowedGitHubTarget(branch: string, paths: string[]): void {
  const branchRules = csvEnv("GITHUB_ALLOWED_BRANCHES", [repositoryConfig().defaultBranch, "codex/"]);
  const branchAllowed = branchRules.some((rule) => branch === rule || (rule.endsWith("/") && branch.startsWith(rule)));
  if (!branchAllowed) throw new Error(`Branch is not allowlisted: ${branch}`);

  const pathRules = csvEnv("GITHUB_ALLOWED_PATH_PREFIXES", ["src/", "public/"]);
  for (const path of paths) {
    const normalized = normalizeRepoPath(path);
    const allowed = pathRules.some((rule) => normalized === rule || normalized.startsWith(rule));
    if (!allowed) throw new Error(`Repository path is not allowlisted: ${path}`);
  }
}

export function normalizeRepoPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    throw new Error(`Invalid repository path: ${path}`);
  }
  return normalized;
}

function encodeRepoPath(path: string): string {
  return normalizeRepoPath(path).split("/").map(encodeURIComponent).join("/");
}

async function githubAccessToken(): Promise<string> {
  const directToken = optionalEnv("GITHUB_TOKEN");
  if (directToken) return directToken;
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now() + 60_000) {
    return cachedInstallationToken.value;
  }

  const appId = requiredEnv("GITHUB_APP_ID");
  const installationId = requiredEnv("GITHUB_INSTALLATION_ID");
  const privateKey = requiredEnv("GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n");
  const jwt = createAppJwt(appId, privateKey);
  const response = await fetchJson<{ token: string; expires_at: string }>(
    "GitHub",
    `${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "famille-operation-mcp",
      },
      body: JSON.stringify({
        repositories: [repositoryConfig().repo],
        permissions: { contents: "write", metadata: "read" },
      }),
    },
  );
  cachedInstallationToken = { value: response.token, expiresAt: Date.parse(response.expires_at) };
  return response.token;
}

function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey, "base64url")}`;
}

function csvEnv(name: string, fallback: string[]): string[] {
  return (optionalEnv(name)?.split(",") ?? fallback).map((value) => value.trim()).filter(Boolean);
}
