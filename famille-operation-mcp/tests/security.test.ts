import { describe, expect, it } from "vitest";
import { runAsActor } from "@/lib/auth/context";
import { issueApproval, verifyApproval } from "@/lib/security/approval";
import { redact } from "@/lib/security/redaction";

describe("approval tokens", () => {
  it("binds an approval to actor, operation, target, and payload", () => {
    process.env.MCP_APPROVAL_SECRET = "test-secret-that-is-long-enough-for-unit-tests";
    const actor = { id: "tester", authMode: "oauth" as const, scopes: new Set(["famille.publish"]) };
    runAsActor(actor, () => {
      const payload = { postId: 42, status: "publish" };
      const { approvalToken } = issueApproval("wordpress.publish", "post:42", payload);
      expect(verifyApproval(approvalToken, "wordpress.publish", "post:42", payload).actorId).toBe("tester");
      expect(() => verifyApproval(approvalToken, "wordpress.publish", "post:42", { postId: 43 })).toThrow();
    });
  });
});

describe("redaction", () => {
  it("removes secrets and authorization material", () => {
    expect(redact({ token: "abc", nested: { password: "pw" }, message: "Bearer secret-value" })).toEqual({
      token: "[REDACTED]",
      nested: { password: "[REDACTED]" },
      message: "Bearer [REDACTED]",
    });
  });
});
