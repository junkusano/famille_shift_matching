import "server-only";

import { createHash, createPrivateKey } from "crypto";
import { SignJWT } from "jose";
import { z } from "zod";
import type { ConnectorResult, KnowledgeConnector, NormalizedSourceObject } from "@/lib/knowledge/types";

const configSchema = z.object({ repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), branch: z.string().min(1).max(200) });
const API = "https://api.github.com";
const SCAN_BATCH_SIZE = 25;

type GitHubTreeItem = { path?: string; type?: string; sha?: string; size?: number };
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function getGitHubToken(signal: AbortSignal) {
  const appId = process.env.GITHUB_KNOWLEDGE_APP_ID;
  const privateKey = process.env.GITHUB_KNOWLEDGE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const installationId = process.env.GITHUB_KNOWLEDGE_INSTALLATION_ID;
  if (!appId && !privateKey && !installationId) return null;
  if (!appId || !privateKey || !installationId) {
    throw new Error("GitHub Appの設定が不足しています。3項目をすべて設定してください。");
  }
  // GitHub currently downloads RSA private keys as PKCS#1 PEM, while some
  // deployments may supply PKCS#8 PEM. Node's parser safely accepts both.
  const key = createPrivateKey(privateKey);
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
    signal,
  });
  if (!response.ok) throw new Error(`GitHub credential exchange failed (${response.status}).`);
  const body = await response.json() as { token?: string };
  if (!body.token) throw new Error("GitHub installation token was not returned.");
  return body.token;
}

async function githubFetch<T>(path: string, token: string | null, signal: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    headers,
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    if (!token && response.status === 404) {
      throw new Error("非公開GitHubリポジトリを読むためのGitHub App接続が未設定です。");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("GitHub Appの設定が無効か、対象リポジトリへの権限がありません。");
    }
    throw new Error(`GitHub APIへの接続に失敗しました（${response.status}）。`);
  }
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
    const token = await getGitHubToken(ctx.signal);
    const repo = await githubFetch<{ full_name: string; default_branch: string; private: boolean }>(`/repos/${config.repository}`, token, ctx.signal);
    return { ok: true, details: { repository: repo.full_name, defaultBranch: repo.default_branch, private: repo.private } };
  },

  async fetchDelta(ctx): Promise<ConnectorResult> {
    const config = configSchema.parse(ctx.source.config);
    const token = await getGitHubToken(ctx.signal);
    // Pin the snapshot until every page is committed, even if HEAD moves.
    const sameSource = ctx.cursor.repository === config.repository && ctx.cursor.branch === config.branch;
    const pendingSha = sameSource && typeof ctx.cursor.scanSha === "string" ? ctx.cursor.scanSha : null;
    const headSha = pendingSha ?? (await githubFetch<{ commit: { sha: string } }>(
      `/repos/${config.repository}/branches/${encodeURIComponent(config.branch)}`, token, ctx.signal
    )).commit.sha;
    if (!pendingSha && sameSource && ctx.cursor.scanVersion === 2 && ctx.cursor.lastCommitSha === headSha) {
      return { objects: [], proposedKnowledge: [], nextCursor: { ...ctx.cursor }, hasMore: false, warnings: [] };
    }
    const commit = await githubFetch<{ tree: { sha: string } }>(`/repos/${config.repository}/git/commits/${headSha}`, token, ctx.signal);
    const tree = await githubFetch<{ tree?: GitHubTreeItem[]; truncated?: boolean }>(`/repos/${config.repository}/git/trees/${commit.tree.sha}?recursive=1`, token, ctx.signal);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("GitHubのファイル一覧を完全に取得できませんでした。進捗は更新しません。");
    const files = tree.tree.filter(item => item.type === "blob" && item.path && item.sha && isEligible(item.path)).sort((a, b) => a.path! < b.path! ? -1 : a.path! > b.path! ? 1 : 0);
    const offset = pendingSha && Number.isSafeInteger(ctx.cursor.scanOffset) && Number(ctx.cursor.scanOffset) >= 0 ? Number(ctx.cursor.scanOffset) : 0;
    const batch = files.slice(offset, offset + SCAN_BATCH_SIZE);
    const nextOffset = offset + batch.length;
    const hasMore = nextOffset < files.length;
    return {
      objects: batch.map(item => makeObject({ repository: config.repository, branch: config.branch, path: item.path!, commitSha: headSha, blobSha: item.sha! })),
      proposedKnowledge: ctx.cursor.lastCommitSha && batch.length ? [{
        knowledgeKey: `github:${config.repository}:snapshot:${headSha}:${offset}`,
        knowledgeType: "system_change", title: `${config.repository} コード索引 ${headSha.slice(0, 8)}`,
        summary: `${offset + 1}〜${nextOffset}件のファイル構成を確認しました。変更差分の断定ではありません。`,
        sourceUrl: `https://github.com/${config.repository}/tree/${headSha}`,
        category: "システム設計", tags: ["GitHub", config.repository, "コード索引"], importance: 3,
        privacyLevel: 2, publishability: "internal_only", authorship: "source",
        evidenceExternalIds: batch.map(item => item.path!), metadata: { repository: config.repository, commitSha: headSha },
      }] : [],
      nextCursor: { repository: config.repository, branch: config.branch, scanVersion: 2,
        ...(hasMore ? { scanSha: headSha, scanOffset: nextOffset, scanTotal: files.length, lastCommitSha: ctx.cursor.lastCommitSha ?? null } : { lastCommitSha: headSha }),
        lastCheckedAt: new Date().toISOString() },
      hasMore,
      warnings: hasMore ? [`コード同期 ${nextOffset}/${files.length}件。残りは次回に続きから同期します。`] : [],
    };
  },
};
