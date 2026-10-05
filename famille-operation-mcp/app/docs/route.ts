export async function GET() {
  return Response.json({
    name: "ファミーユ操作MCP",
    endpoint: "/mcp",
    transport: "Streamable HTTP",
    version: "0.1.0",
    policy: "Only explicit, allowlisted business operations are exposed. No arbitrary shell or delete tools are provided.",
    scopes: {
      "famille.read": "Read repository, deployment, and article state",
      "famille.write": "Create drafts and Preview deployments",
      "famille.publish": "Commit, update published content, publish, schedule, or promote to Production",
    },
  });
}
