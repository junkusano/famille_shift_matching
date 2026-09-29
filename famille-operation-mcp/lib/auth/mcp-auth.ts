import { createRemoteJWKSet, jwtVerify } from "jose";
import { optionalEnv, requiredEnv, httpsBaseUrl } from "@/lib/config";
import type { Actor, AuthMode } from "@/lib/auth/context";

const ALL_STATIC_SCOPES = new Set(["*", "famille.read", "famille.write", "famille.publish"]);

export function authMode(): AuthMode {
  const mode = optionalEnv("MCP_AUTH_MODE") ?? "oauth";
  if (mode !== "oauth" && mode !== "static") throw new Error("MCP_AUTH_MODE must be oauth or static");
  if (process.env.NODE_ENV === "production" && mode === "static") {
    throw new Error("MCP_AUTH_MODE=static is disabled in production");
  }
  return mode;
}

export async function authenticateRequest(request: Request): Promise<Actor> {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AuthError("Missing bearer token", 401);

  if (authMode() === "static") {
    const expected = requiredEnv("MCP_STATIC_BEARER_TOKEN");
    if (!constantTimeEqual(token, expected)) throw new AuthError("Invalid bearer token", 401);
    return { id: "local-static-user", authMode: "static", scopes: ALL_STATIC_SCOPES };
  }

  const issuer = requiredEnv("MCP_OAUTH_ISSUER");
  const audience = requiredEnv("MCP_OAUTH_AUDIENCE");
  const jwksUrl = new URL(requiredEnv("MCP_OAUTH_JWKS_URL"));
  const jwks = createRemoteJWKSet(jwksUrl);
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience });
    const subject = payload.sub;
    if (!subject) throw new Error("OAuth token has no subject");
    const scopeText = typeof payload.scope === "string" ? payload.scope : "";
    return {
      id: subject,
      authMode: "oauth",
      scopes: new Set(scopeText.split(/\s+/).filter(Boolean)),
    };
  } catch {
    throw new AuthError("Invalid or expired OAuth token", 401);
  }
}

export function authChallenge(requiredScope = "famille.read"): string {
  const metadata = `${httpsBaseUrl("MCP_PUBLIC_BASE_URL")}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}", scope="${requiredScope}"`;
}

export function securitySchemes(scopes: string[]) {
  if (authMode() === "oauth") return [{ type: "oauth2" as const, scopes }];
  return [{ type: "noauth" as const }];
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}
