export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "famille-operation-mcp",
    version: "0.1.0",
  });
}
