import "server-only";

import { createHash } from "crypto";
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";
import type { ConnectorResult, KnowledgeConnector, NormalizedSourceObject } from "@/lib/knowledge/types";

const configSchema = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), branch: z.string().min(1).max(200) });
const API = "https://api.github.com";

type GitHubTreeItem = { path?: string; type?: string; sha?: string; size?: number };
type GitHubFile = { filename: string; sha: string; status: string; patch?: string; additions?: number; deletions?: number };
type GitHubCompare = { status: string; commits?: Array<{ sha: string; commit?: { message?: string; author?: { date?: string } } }>; files?: GitHubFile[] };

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function getGitHubToken() {
  const appId = process.env.GITHUB_KNOWLEDGE_APP_ID;
  const privateKey = process.env.GITHUB_KNOWLEDGE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const installationId = process.env.GITHUB_KNOWLEDGE_INSTALLATION_ID;
  if (!appId || !privateKey || !installationId) throw new Error("GitHub knowledge credentials are not configured.");
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1_000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 30)
    .setExpirationTime(now + 8 * 60)
    .setIssuer(appId)
    .sign(key);
  const response = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${jwt}`, "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub credential exchange failed (${response.status}).`);
  const body = await response.json() as { token?: string };
  if (!body.token) throw new Error("GitHub installation token was not returned.");
  return body.token;
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

function isEligible(path: string) {
  if (/(^|\/)(node_modules|\.next|dist|build|coverage|vendor)(\/|$)/i.test(path)) return false;
  if (/(^|\/)\.env/i.test(path) || /(credential|private[_-]?key|secret)/i.test(path)) return false;
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|mp[34]|mov|woff2?|ttf|lock)$/i.test(path)) return false;
  return /\.(ts|tsx|js|jsx|sql|json|md|yml|yaml|toml)$/i.test(path);
}

function language(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ({ ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React", sql: "SQL", md: "Markdown", json: "JSON", yml: "YAML", yaml: "YAML", toml: "TOML" } as Record<string, string>)[ext ?? ""] ?? "Text";
}

function classify(path: string, patch = "") {
  const normalized = path.replaceAll("\\", "/");
  const component = normalized.startsWith("src/app/api/") ? "api" : normalized.startsWith("src/app/") ? "ui" : normalized.startsWith("src/lib/") ? "domain" : normalized.startsWith("supabase/") ? "database" : normalized.includes("cron") ? "batch" : "repository";
  const routeMatch = normalized.match(/^src\/app\/(api\/.*)\/route\.(?:ts|js)$/);
  const tableMatches = [...patch.matchAll(/(?:\.from\(|public\.)(?:["'`])?([a-z][a-z0-9_]{1,100})/gi)].map((match) => match[1]);
  const security = [
    /auth|login|oauth/i.test(normalized + patch) ? "auth" : null,
    /rls|row level security|policy/i.test(normalized + patch) ? "rls" : null,
    /secret|token|credential/i.test(normalized + patch) ? "secrets" : null,
    /fax|client|kaipoke|personal/i.test(normalized + patch) ? "personal_data" : null,
  ].filter((value): value is string => Boolean(value));
  const feature = normalized.split("/").slice(0, 4).join("/");
  const role = component === "api" ? "サーバーAPI Route" : component === "ui" ? "画面・ルーティング" : component === "database" ? "DB定義・移行" : component === "domain" ? "業務ロジック・外部連携" : "構成・文書";
  return {
    component,
    feature,
    architecturalRole: role,
    relatedTables: [...new Set(tableMatches)],
    relatedApiRoutes: routeMatch ? [`/${routeMatch[1].replaceAll("/", "/")}`] : [],
    securityRelevance: security,
    summary: `${role}を担う ${normalized}。内容の断定は行わず、変更差分と関連先を索引化しています。`,
  };
}

function makeObject(input: { repository: string; branch: string; path: string; commitSha: string; blobSha: string; patch?: string; status?: string }): NormalizedSourceObject {
  const classified = classify(input.path, input.patch);
  return {
    externalId: input.path,
    objectType: "github_file",
    sourceRevision: input.commitSha,
    title: input.path,
    sourceUrl: `https://github.com/${input.repository}/blob/${input.commitSha}/${input.path}`,
    contentHash: digest({ blobSha: input.blobSha, status: input.status }),
    locator: { repository: input.repository, branch: input.branch, path: input.path, commitSha: input.commitSha },
    metadata: {
      github: {
        repository: input.repository,
        branch: input.branch,
        path: input.path,
        commitSha: input.commitSha,
        fileUrl: `https://github.com/${input.repository}/blob/${input.commitSha}/${input.path}`,
        language: language(input.path),
        component: classified.component,
        feature: classified.feature,
        architecturalRole: classified.architecturalRole,
        summary: classified.summary,
        relatedTables: classified.relatedTables,
        relatedApiRoutes: classified.relatedApiRoutes,
        securityRelevance: classified.securityRelevance,
        analysisConfidence: 0.55,
      },
    },
    privacyLevel: 2,
    publishability: "internal_only",
    containsPersonalData: false,
  };
}

export const githubConnector: KnowledgeConnector = {
  key: "github",

  async testConnection(ctx) {
    const config = configSchema.parse(ctx.source.config);
    const token = await getGitHubToken();
    const repo = await githubFetch<{ full_name: string; default_branch: string; private: boolean }>(`/repos/${config.repository}`, token);
    return { ok: true, details: { repository: repo.full_name, defaultBranch: repo.default_branch, private: repo.private } };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const config = configSchema.parse(ctx.source.config);
    const token = await getGitHubToken();
    const branch = await githubFetch<{ commit: { sha: string } }>(`/repos/${config.repository}/branches/${encodeURIComponent(config.branch)}`, token);
    const headSha = branch.commit.sha;
    const previousSha = typeof ctx.cursor.lastCommitSha === "string" ? ctx.cursor.lastCommitSha : null;
    if (previousSha === headSha) return { objects: [], proposedKnowledge: [], nextCursor: { ...ctx.cursor, lastCheckedAt: new Date().toISOString() }, hasMore: false, warnings: [] };

    let objects: NormalizedSourceObject[];
    let commitMessages: string[] = [];
    if (!previousSha) {
      const commit = await githubFetch<{ tree: { sha: string } }>(`/repos/${config.repository}/git/commits/${headSha}`, token);
      const tree = await githubFetch<{ tree?: GitHubTreeItem[]; truncated?: boolean }>(`/repos/${config.repository}/git/trees/${commit.tree.sha}?recursive=1`, token);
      objects = (tree.tree ?? []).filter((item) => item.type === "blob" && item.path && item.sha && isEligible(item.path)).slice(0, 500).map((item) => makeObject({ repository: config.repository, branch: config.branch, path: item.path!, commitSha: headSha, blobSha: item.sha! }));
      return {
        objects,
        proposedKnowledge: [],
        nextCursor: { repository: config.repository, branch: config.branch, lastCommitSha: headSha, lastCheckedAt: new Date().toISOString() },
        hasMore: Boolean(tree.truncated),
        warnings: tree.truncated ? ["GitHub treeが大きいため、初回解析は500ファイルまで索引化しました。"] : [],
      };
    }

    const compare = await githubFetch<GitHubCompare>(`/repos/${config.repository}/compare/${previousSha}...${headSha}`, token);
    if (compare.status === "diverged") throw new Error("GitHub history diverged. Admin review is required.");
    const files = (compare.files ?? []).filter((file) => isEligible(file.filename));
    objects = files.map((file) => makeObject({ repository: config.repository, branch: config.branch, path: file.filename, commitSha: headSha, blobSha: file.sha, patch: file.patch, status: file.status }));
    commitMessages = (compare.commits ?? []).map((commit) => commit.commit?.message?.split("\n")[0] ?? commit.sha.slice(0, 8)).slice(-20);
    const proposal = files.length ? [{
      knowledgeKey: `github:${config.repository}:change:${headSha}`,
      knowledgeType: "system_change",
      title: `${config.repository} の変更 ${headSha.slice(0, 8)}`,
      summary: `${files.length}ファイルが変更されました。${commitMessages.join(" / ")}`.slice(0, 20_000),
      sourceUrl: `https://github.com/${config.repository}/compare/${previousSha}...${headSha}`,
      category: "システム設計",
      tags: ["GitHub", config.repository, "変更履歴"],
      importance: 3 as const,
      confidence: 0.7,
      privacyLevel: 2 as const,
      publishability: "internal_only" as const,
      authorship: "source" as const,
      evidenceExternalIds: files.map((file) => file.filename),
      metadata: { repository: config.repository, branch: config.branch, fromSha: previousSha, toSha: headSha, commitMessages },
    }] : [];
    return {
      objects,
      proposedKnowledge: proposal,
      nextCursor: { repository: config.repository, branch: config.branch, lastCommitSha: headSha, lastCheckedAt: new Date().toISOString() },
      hasMore: false,
      warnings: [],
    };
  },
};
