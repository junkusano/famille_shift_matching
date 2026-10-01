import { NextRequest } from "next/server";
import { GET as handleDecisionStatus } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const url = new URL(request.url);
  url.searchParams.set("decision_token", token);
  return handleDecisionStatus(new NextRequest(url, {
    method: "GET",
    headers: request.headers,
  }));
}
