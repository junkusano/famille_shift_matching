import { httpsBaseUrl, requiredEnv } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const resource = httpsBaseUrl("MCP_PUBLIC_BASE_URL");
  return Response.json({
    resource,
    authorization_servers: [requiredEnv("MCP_OAUTH_ISSUER")],
    scopes_supported: ["famille.read", "famille.write", "famille.publish"],
    resource_documentation: `${resource}/docs`,
  });
}
