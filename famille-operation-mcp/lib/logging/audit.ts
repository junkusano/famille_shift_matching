import { getActor } from "@/lib/auth/context";
import { redact, safeErrorMessage } from "@/lib/security/redaction";

export type AuditEvent = {
  tool: string;
  target: string;
  outcome: "success" | "failure";
  summary: Record<string, unknown>;
  durationMs: number;
};

export function writeAudit(event: AuditEvent): void {
  const actor = getActor();
  const entry = redact({
    type: "famille_mcp_audit",
    occurredAt: new Date().toISOString(),
    actorId: actor?.id ?? "unknown",
    authMode: actor?.authMode ?? "unknown",
    ...event,
  });
  console.info(JSON.stringify(entry));
}

export async function audited<T>(
  tool: string,
  target: string,
  summary: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await operation();
    writeAudit({ tool, target, summary, outcome: "success", durationMs: Date.now() - started });
    return result;
  } catch (error) {
    writeAudit({
      tool,
      target,
      summary: { ...summary, error: safeErrorMessage(error) },
      outcome: "failure",
      durationMs: Date.now() - started,
    });
    throw error;
  }
}
