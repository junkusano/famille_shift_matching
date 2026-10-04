import { createTwoFilesPatch } from "diff";
import { z } from "zod";
import { requireScope } from "@/lib/auth/context";
import { securitySchemes } from "@/lib/auth/mcp-auth";
import { repositoryConfig } from "@/lib/config";
import { audited } from "@/lib/logging/audit";
import { errorResult, okResult } from "@/lib/mcp/result";
import { issueApproval, stableHash, verifyApproval } from "@/lib/security/approval";
import {
  assertAllowedGitHubTarget,
  getBranchHead,
  getFileAtRef,
  githubRequest,
  normalizeRepoPath,
  repoPath,
} from "./client";

const branchSchema = z.string().trim().min(1).max(200);
const pathSchema = z.string().trim().min(1).max(500);
const changeSchema = z.object({ path: pathSchema, content: z.string().max(500_000) });
const changesSchema = z.array(changeSchema).min(1).max(20);

type McpServer = {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: never) => Promise<unknown>,
  ) => void;
};

export function registerGithubTools(server: McpServer): void {
  server.registerTool("github_get_repository_status", {
    title: "Get repository status",
    description: "Use this to inspect the allowlisted repository, a branch head, and its relationship to a base branch before making changes.",
    inputSchema: z.object({ branch: branchSchema.optional(), base: branchSchema.optional() }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ branch, base }: { branch?: string; base?: string }) => {
    requireScope("famille.read");
    const config = repositoryConfig();
    const selectedBranch = branch ?? config.defaultBranch;
    const selectedBase = base ?? config.defaultBranch;
    const [repository, headSha, comparison] = await Promise.all([
      githubRequest<Record<string, unknown>>(repoPath()),
      getBranchHead(selectedBranch),
      selectedBranch === selectedBase
        ? Promise.resolve(null)
        : githubRequest<Record<string, unknown>>(
          repoPath(`/compare/${encodeURIComponent(selectedBase)}...${encodeURIComponent(selectedBranch)}`),
        ),
    ]);
    return {
      repository: `${config.owner}/${config.repo}`,
      visibility: repository.visibility,
      defaultBranch: repository.default_branch,
      branch: selectedBranch,
      headSha,
      comparison: comparison && {
        base: selectedBase,
        status: comparison.status,
        aheadBy: comparison.ahead_by,
        behindBy: comparison.behind_by,
        totalCommits: comparison.total_commits,
      },
    };
  }));

  server.registerTool("github_get_file", {
    title: "Get repository file",
    description: "Use this to read one file from the allowlisted GitHub repository at a branch, tag, or commit.",
    inputSchema: z.object({ path: pathSchema, ref: branchSchema.optional() }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ path, ref }: { path: string; ref?: string }) => {
    requireScope("famille.read");
    const selectedRef = ref ?? repositoryConfig().defaultBranch;
    const file = await getFileAtRef(path, selectedRef);
    if (!file) throw new Error(`File not found: ${path}`);
    return { ...file, ref: selectedRef };
  }));

  server.registerTool("github_get_diff", {
    title: "Compare GitHub refs",
    description: "Use this to inspect commits and changed files between two GitHub refs before deciding whether to deploy changes.",
    inputSchema: z.object({ base: branchSchema, head: branchSchema }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ base, head }: { base: string; head: string }) => {
    requireScope("famille.read");
    const comparison = await githubRequest<{
      status: string;
      ahead_by: number;
      behind_by: number;
      total_commits: number;
      files?: Array<{ filename: string; status: string; additions: number; deletions: number; changes: number; patch?: string }>;
    }>(repoPath(`/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`));
    return {
      base,
      head,
      status: comparison.status,
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      totalCommits: comparison.total_commits,
      files: (comparison.files ?? []).map((file) => ({ ...file, patch: file.patch?.slice(0, 30_000) })),
    };
  }));

  registerCommitTools(server);
}

function registerCommitTools(server: McpServer): void {
  server.registerTool("github_prepare_commit", {
    title: "Prepare GitHub commit",
    description: "Use this to calculate and review a proposed atomic commit. It does not change GitHub and returns a short-lived approval token.",
    inputSchema: z.object({ branch: branchSchema, message: z.string().trim().min(3).max(200), changes: changesSchema }),
    securitySchemes: securitySchemes(["famille.write"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ branch, message, changes }: CommitInput) => {
    requireScope("famille.write");
    const normalized = normalizeChanges(changes);
    assertAllowedGitHubTarget(branch, normalized.map((item) => item.path));
    const expectedHeadSha = await getBranchHead(branch);
    const previews = await Promise.all(normalized.map(async (change) => {
      const current = await getFileAtRef(change.path, expectedHeadSha);
      return {
        path: change.path,
        operation: current ? "update" : "create",
        currentSha: current?.sha ?? null,
        newContentSha256: stableHash(change.content),
        diff: createTwoFilesPatch(
          `a/${change.path}`,
          `b/${change.path}`,
          current?.content ?? "",
          change.content,
          current?.sha ?? "new",
          "proposed",
          { context: 3 },
        ).slice(0, 50_000),
      };
    }));
    const payload = commitApprovalPayload(branch, message, expectedHeadSha, normalized);
    return {
      repository: `${repositoryConfig().owner}/${repositoryConfig().repo}`,
      branch,
      message,
      expectedHeadSha,
      files: previews,
      ...issueApproval("github.commit", `${repositoryConfig().owner}/${repositoryConfig().repo}:${branch}`, payload),
      nextStep: "After explicit user confirmation, call github_commit_changes with unchanged inputs, expectedHeadSha, and approvalToken.",
    };
  }));

  server.registerTool("github_commit_changes", {
    title: "Commit approved GitHub changes",
    description: "Use this only after explicit confirmation to create one atomic commit on an allowlisted branch. The branch head and approved content must still match.",
    inputSchema: z.object({
      branch: branchSchema,
      message: z.string().trim().min(3).max(200),
      expectedHeadSha: z.string().regex(/^[0-9a-f]{40}$/),
      changes: changesSchema,
      approvalToken: z.string().min(20),
    }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, wrap(async ({ branch, message, expectedHeadSha, changes, approvalToken }: CommitExecutionInput) => {
    requireScope("famille.publish");
    const normalized = normalizeChanges(changes);
    assertAllowedGitHubTarget(branch, normalized.map((item) => item.path));
    const target = `${repositoryConfig().owner}/${repositoryConfig().repo}:${branch}`;
    const payload = commitApprovalPayload(branch, message, expectedHeadSha, normalized);
    verifyApproval(approvalToken, "github.commit", target, payload);
    return audited("github_commit_changes", target, { branch, message, files: normalized.map((item) => item.path) }, async () => {
      const currentHead = await getBranchHead(branch);
      if (currentHead !== expectedHeadSha) throw new Error("Branch changed after approval; prepare the commit again");
      const parent = await githubRequest<{ tree: { sha: string } }>(repoPath(`/git/commits/${currentHead}`));
      const blobs = await Promise.all(normalized.map(async (change) => {
        const blob = await githubRequest<{ sha: string }>(repoPath("/git/blobs"), {
          method: "POST",
          body: JSON.stringify({ content: change.content, encoding: "utf-8" }),
        });
        return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
      }));
      const tree = await githubRequest<{ sha: string }>(repoPath("/git/trees"), {
        method: "POST",
        body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs }),
      });
      const commit = await githubRequest<{ sha: string }>(repoPath("/git/commits"), {
        method: "POST",
        body: JSON.stringify({ message, tree: tree.sha, parents: [currentHead] }),
      });
      await githubRequest(repoPath(`/git/refs/heads/${encodeURIComponent(branch)}`), {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return { repository: `${repositoryConfig().owner}/${repositoryConfig().repo}`, branch, previousHead: currentHead, commitSha: commit.sha };
    });
  }));
}

type CommitInput = { branch: string; message: string; changes: Array<{ path: string; content: string }> };
type CommitExecutionInput = CommitInput & { expectedHeadSha: string; approvalToken: string };

function normalizeChanges(changes: CommitInput["changes"]): CommitInput["changes"] {
  const seen = new Set<string>();
  return changes.map((change) => {
    const path = normalizeRepoPath(change.path);
    if (seen.has(path)) throw new Error(`Duplicate changed path: ${path}`);
    seen.add(path);
    return { path, content: change.content };
  });
}

function commitApprovalPayload(branch: string, message: string, expectedHeadSha: string, changes: CommitInput["changes"]) {
  return {
    branch,
    message,
    expectedHeadSha,
    changes: changes.map((change) => ({ path: change.path, contentSha256: stableHash(change.content) })),
  };
}

function wrap<TInput>(handler: (input: TInput) => Promise<unknown>) {
  return (async (input: TInput) => {
    try {
      return okResult(await handler(input));
    } catch (error) {
      return errorResult(error);
    }
  }) as never;
}
