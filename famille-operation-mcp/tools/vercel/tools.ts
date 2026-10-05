import { z } from "zod";
import { requireScope } from "@/lib/auth/context";
import { securitySchemes } from "@/lib/auth/mcp-auth";
import { repositoryConfig, vercelConfig } from "@/lib/config";
import { audited } from "@/lib/logging/audit";
import { errorResult, okResult } from "@/lib/mcp/result";
import { issueApproval, verifyApproval } from "@/lib/security/approval";
import { getBranchHead } from "@/tools/github/client";
import { vercelRequest, vercelStreamRequest } from "./client";

const deploymentIdSchema = z.string().trim().min(3).max(300);
const refSchema = z.string().trim().min(1).max(200);

type McpServer = { registerTool: (name: string, config: Record<string, unknown>, handler: (input: never) => Promise<unknown>) => void };

export function registerVercelTools(server: McpServer): void {
  server.registerTool("vercel_get_project_status", {
    title: "Get Vercel project status",
    description: "Use this to inspect the single allowlisted Vercel project and recent deployments without changing anything.",
    inputSchema: z.object({ deploymentLimit: z.number().int().min(1).max(20).default(5) }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ deploymentLimit }: { deploymentLimit: number }) => {
    requireScope("famille.read");
    const config = vercelConfig();
    const [project, deployments] = await Promise.all([
      vercelRequest<Record<string, unknown>>(`/v9/projects/${encodeURIComponent(config.projectId)}`),
      listDeployments(deploymentLimit),
    ]);
    return { project: summarizeProject(project), deployments: deployments.map(summarizeDeployment) };
  }));

  server.registerTool("vercel_list_deployments", {
    title: "List Vercel deployments",
    description: "Use this to list recent Preview or Production deployments for the allowlisted project.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(10), target: z.enum(["preview", "production"]).optional() }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ limit, target }: { limit: number; target?: "preview" | "production" }) => {
    requireScope("famille.read");
    const deployments = await listDeployments(limit, target);
    return { projectId: vercelConfig().projectId, deployments: deployments.map(summarizeDeployment) };
  }));

  server.registerTool("vercel_get_deployment", {
    title: "Get Vercel deployment",
    description: "Use this to inspect one deployment status before reviewing logs or promoting it.",
    inputSchema: z.object({ deploymentId: deploymentIdSchema }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ deploymentId }: { deploymentId: string }) => {
    requireScope("famille.read");
    return summarizeDeployment(await getDeployment(deploymentId));
  }));

  server.registerTool("vercel_get_build_logs", {
    title: "Get Vercel build logs",
    description: "Use this to inspect bounded build logs, especially after a deployment build fails.",
    inputSchema: z.object({ deploymentId: deploymentIdSchema, limit: z.number().int().min(1).max(300).default(100), errorsOnly: z.boolean().default(false) }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ deploymentId, limit, errorsOnly }: { deploymentId: string; limit: number; errorsOnly: boolean }) => {
    requireScope("famille.read");
    const events = await vercelStreamRequest(`/v3/deployments/${encodeURIComponent(deploymentId)}/events?follow=0&direction=backward&limit=${limit}`);
    const filtered = errorsOnly ? events.filter((event) => /error|fatal|stderr|exit/i.test(JSON.stringify(event))) : events;
    return { deploymentId, events: filtered.slice(0, limit) };
  }));

  server.registerTool("vercel_get_runtime_logs", {
    title: "Get Vercel runtime logs",
    description: "Use this to inspect bounded runtime logs for one known deployment. It never follows an unbounded stream.",
    inputSchema: z.object({ deploymentId: deploymentIdSchema, limit: z.number().int().min(1).max(200).default(50) }),
    securitySchemes: securitySchemes(["famille.read"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ deploymentId, limit }: { deploymentId: string; limit: number }) => {
    requireScope("famille.read");
    const deployment = await getDeployment(deploymentId);
    assertDeploymentProject(deployment);
    const logs = await vercelStreamRequest(`/v1/projects/${encodeURIComponent(vercelConfig().projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`);
    return { deploymentId, logs: logs.slice(-limit) };
  }));

  registerDeploymentMutations(server);
}

function registerDeploymentMutations(server: McpServer): void {
  server.registerTool("vercel_prepare_preview_deployment", {
    title: "Prepare Preview deployment",
    description: "Use this to pin a GitHub branch to an exact commit and prepare a Preview deployment without creating it.",
    inputSchema: z.object({ gitRef: refSchema }),
    securitySchemes: securitySchemes(["famille.write"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ gitRef }: { gitRef: string }) => {
    requireScope("famille.write");
    const gitSha = await getBranchHead(gitRef);
    const payload = { gitRef, gitSha, projectId: vercelConfig().projectId };
    return {
      ...payload,
      ...issueApproval("vercel.preview.deploy", vercelConfig().projectId, payload),
      nextStep: "After explicit confirmation, call vercel_create_preview_deployment with the unchanged values and approvalToken.",
    };
  }));

  server.registerTool("vercel_create_preview_deployment", {
    title: "Create approved Preview deployment",
    description: "Use this only after confirmation to create a Preview deployment from the exact approved GitHub commit.",
    inputSchema: z.object({ gitRef: refSchema, gitSha: z.string().regex(/^[0-9a-f]{40}$/), approvalToken: z.string().min(20) }),
    securitySchemes: securitySchemes(["famille.write"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, wrap(async ({ gitRef, gitSha, approvalToken }: { gitRef: string; gitSha: string; approvalToken: string }) => {
    requireScope("famille.write");
    const config = vercelConfig();
    const payload = { gitRef, gitSha, projectId: config.projectId };
    verifyApproval(approvalToken, "vercel.preview.deploy", config.projectId, payload);
    return audited("vercel_create_preview_deployment", config.projectId, { gitRef, gitSha }, async () => {
      const currentSha = await getBranchHead(gitRef);
      if (currentSha !== gitSha) throw new Error("GitHub branch changed after approval; prepare the Preview deployment again");
      const repository = repositoryConfig();
      const deployment = await vercelRequest<Record<string, unknown>>("/v13/deployments", {
        method: "POST",
        body: JSON.stringify({
          name: config.projectName,
          project: config.projectId,
          gitSource: { type: "github", org: repository.owner, repo: repository.repo, ref: gitRef, sha: gitSha },
        }),
      });
      return summarizeDeployment(deployment);
    });
  }));

  server.registerTool("vercel_prepare_production_promotion", {
    title: "Prepare Production promotion",
    description: "Use this to verify a READY deployment and prepare promotion of that exact artifact to Production. It does not change traffic.",
    inputSchema: z.object({ deploymentId: deploymentIdSchema }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, wrap(async ({ deploymentId }: { deploymentId: string }) => {
    requireScope("famille.publish");
    const deployment = await getDeployment(deploymentId);
    assertDeploymentProject(deployment);
    const readyState = String(deployment.readyState ?? deployment.status ?? "");
    if (readyState !== "READY") throw new Error(`Deployment is not READY: ${readyState}`);
    const payload = { deploymentId: String(deployment.id), projectId: vercelConfig().projectId };
    return {
      deployment: summarizeDeployment(deployment),
      ...issueApproval("vercel.production.promote", vercelConfig().projectId, payload),
      nextStep: "After explicit confirmation, call vercel_promote_to_production with deploymentId and approvalToken.",
    };
  }));

  server.registerTool("vercel_promote_to_production", {
    title: "Promote approved deployment to Production",
    description: "Use this only after explicit confirmation to point Production traffic at one previously verified deployment without rebuilding it.",
    inputSchema: z.object({ deploymentId: deploymentIdSchema, approvalToken: z.string().min(20) }),
    securitySchemes: securitySchemes(["famille.publish"]),
    annotations: { readOnlyHint: false, destructiveHint: true },
  }, wrap(async ({ deploymentId, approvalToken }: { deploymentId: string; approvalToken: string }) => {
    requireScope("famille.publish");
    const config = vercelConfig();
    const payload = { deploymentId, projectId: config.projectId };
    verifyApproval(approvalToken, "vercel.production.promote", config.projectId, payload);
    return audited("vercel_promote_to_production", config.projectId, { deploymentId }, async () => {
      const deployment = await getDeployment(deploymentId);
      assertDeploymentProject(deployment);
      if (String(deployment.readyState ?? deployment.status ?? "") !== "READY") {
        throw new Error("Deployment is no longer READY");
      }
      await vercelRequest(`/v10/projects/${encodeURIComponent(config.projectId)}/promote/${encodeURIComponent(deploymentId)}`, { method: "POST" });
      return { projectId: config.projectId, deploymentId, status: "PROMOTION_REQUESTED" };
    });
  }));
}

async function listDeployments(limit: number, target?: "preview" | "production"): Promise<Record<string, unknown>[]> {
  const query = new URLSearchParams({ projectId: vercelConfig().projectId, limit: String(limit) });
  if (target) query.set("target", target);
  const result = await vercelRequest<{ deployments?: Record<string, unknown>[] }>(`/v6/deployments?${query}`);
  return result.deployments ?? [];
}

async function getDeployment(deploymentId: string): Promise<Record<string, unknown>> {
  return vercelRequest<Record<string, unknown>>(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
}

function assertDeploymentProject(deployment: Record<string, unknown>): void {
  const projectId = String(deployment.projectId ?? (deployment.project as Record<string, unknown> | undefined)?.id ?? "");
  if (projectId && projectId !== vercelConfig().projectId) throw new Error("Deployment does not belong to the allowlisted project");
}

function summarizeProject(project: Record<string, unknown>) {
  return { id: project.id, name: project.name, framework: project.framework, updatedAt: project.updatedAt, nodeVersion: project.nodeVersion };
}

function summarizeDeployment(deployment: Record<string, unknown>) {
  return {
    id: deployment.id ?? deployment.uid,
    name: deployment.name,
    url: deployment.url ? `https://${deployment.url}` : undefined,
    readyState: deployment.readyState ?? deployment.state ?? deployment.status,
    target: deployment.target,
    createdAt: deployment.createdAt ?? deployment.created,
    gitSource: deployment.gitSource,
    inspectorUrl: deployment.inspectorUrl,
  };
}

function wrap<TInput>(handler: (input: TInput) => Promise<unknown>) {
  return (async (input: TInput) => {
    try { return okResult(await handler(input)); }
    catch (error) { return errorResult(error); }
  }) as never;
}
