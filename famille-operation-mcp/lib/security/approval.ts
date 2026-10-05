import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getActor } from "@/lib/auth/context";
import { positiveIntEnv, requiredEnv } from "@/lib/config";

type ApprovalClaims = {
  version: 1;
  actorId: string;
  action: string;
  target: string;
  payloadHash: string;
  issuedAt: number;
  expiresAt: number;
};

export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function issueApproval(action: string, target: string, payload: unknown) {
  const actor = getActor();
  if (!actor) throw new Error("Cannot issue approval without an authenticated actor");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + positiveIntEnv("MCP_APPROVAL_TTL_SECONDS", 300);
  const claims: ApprovalClaims = {
    version: 1,
    actorId: actor.id,
    action,
    target,
    payloadHash: stableHash(payload),
    issuedAt,
    expiresAt,
  };
  const encoded = base64url(JSON.stringify(claims));
  const signature = sign(encoded);
  return { approvalToken: `${encoded}.${signature}`, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export function verifyApproval(token: string, action: string, target: string, payload: unknown): ApprovalClaims {
  const actor = getActor();
  if (!actor) throw new Error("Cannot verify approval without an authenticated actor");
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) throw new Error("Malformed approval token");
  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error("Invalid approval token signature");
  }
  const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ApprovalClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.expiresAt < now) throw new Error("Approval token has expired; prepare the operation again");
  if (claims.actorId !== actor.id || claims.action !== action || claims.target !== target) {
    throw new Error("Approval token does not match this actor or operation");
  }
  if (claims.payloadHash !== stableHash(payload)) {
    throw new Error("Operation input changed after approval; prepare the operation again");
  }
  return claims;
}

function sign(encoded: string): string {
  return createHmac("sha256", requiredEnv("MCP_APPROVAL_SECRET")).update(encoded).digest("base64url");
}

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}
