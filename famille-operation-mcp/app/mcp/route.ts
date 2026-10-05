import { createMcpHandler } from "mcp-handler";
import { authenticateRequest, authChallenge, AuthError } from "@/lib/auth/mcp-auth";
import { runAsActor } from "@/lib/auth/context";
import { registerGithubTools } from "@/tools/github/tools";
import { registerVercelTools } from "@/tools/vercel/tools";
import { registerWordpressTools } from "@/tools/wordpress/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const mcpHandler = createMcpHandler((server) => {
  registerGithubTools(server as never);
  registerVercelTools(server as never);
  registerWordpressTools(server as never);
}, {
  serverInfo: {
    name: "famille-operation-mcp",
    version: "0.1.0",
  },
});

async function authenticatedHandler(request: Request): Promise<Response> {
  try {
    const actor = await authenticateRequest(request);
    return await runAsActor(actor, () => mcpHandler(request));
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, {
        status: error.status,
        headers: { "WWW-Authenticate": authChallenge() },
      });
    }
    console.error(JSON.stringify({ type: "famille_mcp_auth_failure", occurredAt: new Date().toISOString(), message: "Authentication configuration failed" }));
    return Response.json({ error: "Authentication configuration failed" }, { status: 500 });
  }
}

export { authenticatedHandler as GET, authenticatedHandler as POST, authenticatedHandler as DELETE };
