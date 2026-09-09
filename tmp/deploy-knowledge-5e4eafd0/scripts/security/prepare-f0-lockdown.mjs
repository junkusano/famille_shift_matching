import fs from "node:fs";
import path from "node:path";

const snapshotPath = path.resolve("docs/security/f0-20260830/security-definer-before.json");
const outputRoot = path.resolve("supabase/maintenance/20260830-f0");
const reportRoot = path.resolve("docs/security/f0-20260830");
fs.mkdirSync(outputRoot, { recursive: true });

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
if (snapshot.count !== 35 || snapshot.functions.length !== 35) {
  throw new Error("Expected exactly 35 SECURITY DEFINER functions");
}

const authenticatedRetain = new Set([
  "cm_get_alert_stats()",
  "wf_is_admin()",
  "wf_is_approver()",
  "wf_my_user_id()",
]);
const anonRetain = new Set();

const signature = (fn) => `${fn.name}(${fn.identity_args})`;
const sqlSignature = (fn) => `public."${fn.name.replaceAll('"', '""')}"(${fn.identity_args})`;
const grantSql = (fn, role, allowed) => `${allowed ? "GRANT" : "REVOKE"} EXECUTE ON FUNCTION ${sqlSignature(fn)} ${allowed ? "TO" : "FROM"} ${role};`;

const classifications = snapshot.functions.map((fn) => {
  const sig = signature(fn);
  const keepAuthenticated = authenticatedRetain.has(sig);
  const keepAnon = anonRetain.has(sig);
  let reason = "server/service_role only";
  if (sig === "cm_get_alert_stats()") reason = "browser client with authenticated user JWT";
  if (sig.startsWith("wf_is_")) reason = "called by authenticated RLS policies";
  return {
    signature: sig,
    category: keepAnon ? "C" : keepAuthenticated ? "B" : "A",
    reason,
    retain: {
      PUBLIC: false,
      anon: keepAnon,
      authenticated: keepAuthenticated,
      service_role: true,
    },
    before: {
      PUBLIC: fn.public_execute,
      anon: fn.anon_execute,
      authenticated: fn.authenticated_execute,
      service_role: fn.service_role_execute,
    },
    owner: fn.owner,
    proconfig: fn.proconfig,
    search_path_fixed: fn.search_path_fixed,
    policy_dependencies: fn.policy_dependencies,
    trigger_dependencies: fn.trigger_dependencies,
  };
});

for (const sig of authenticatedRetain) {
  if (!classifications.some((row) => row.signature === sig)) throw new Error(`Missing authenticated retain function: ${sig}`);
}
if (classifications.some((row) => row.category === "D")) throw new Error("Unknown F0 classification exists");

const apply = [
  "-- F0 SECURITY DEFINER lockdown (production, 2026-08-30)",
  "-- Only EXECUTE privileges are changed. Function bodies/search_path/default privileges are unchanged.",
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '5min';",
  "",
];
for (const fn of snapshot.functions) {
  const sig = signature(fn);
  apply.push(`-- ${sig}`);
  apply.push(grantSql(fn, "PUBLIC", false));
  apply.push(grantSql(fn, "anon", anonRetain.has(sig)));
  apply.push(grantSql(fn, "authenticated", authenticatedRetain.has(sig)));
  apply.push(grantSql(fn, "service_role", true));
  apply.push("");
}
apply.push("COMMIT;", "");

const rollback = [
  "-- F0 rollback: restore exact role EXECUTE state captured immediately before F0.",
  "-- CANARY table public.msg_lw_status is intentionally untouched.",
  "BEGIN;",
  "SET LOCAL lock_timeout = '5s';",
  "SET LOCAL statement_timeout = '5min';",
  "",
];
for (const fn of snapshot.functions) {
  rollback.push(`-- ${signature(fn)}`);
  rollback.push(grantSql(fn, "PUBLIC", fn.public_execute));
  rollback.push(grantSql(fn, "anon", fn.anon_execute));
  rollback.push(grantSql(fn, "authenticated", fn.authenticated_execute));
  rollback.push(grantSql(fn, "service_role", fn.service_role_execute));
  rollback.push("");
}
rollback.push("COMMIT;", "");

fs.writeFileSync(path.join(outputRoot, "01_apply_f0_security_definer_lockdown.sql"), apply.join("\n"));
fs.writeFileSync(path.join(outputRoot, "02_rollback_f0_security_definer_lockdown.sql"), rollback.join("\n"));
fs.writeFileSync(path.join(reportRoot, "classification.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  source_snapshot: snapshot.captured_at,
  counts: {
    total: classifications.length,
    server_only: classifications.filter((row) => row.category === "A").length,
    authenticated: classifications.filter((row) => row.category === "B").length,
    anon: classifications.filter((row) => row.category === "C").length,
    unknown: classifications.filter((row) => row.category === "D").length,
    search_path_fixed: classifications.filter((row) => row.search_path_fixed).length,
    search_path_unfixed: classifications.filter((row) => !row.search_path_fixed).length,
  },
  authenticated_retain: [...authenticatedRetain],
  anon_retain: [...anonRetain],
  functions: classifications,
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  counts: {
    total: classifications.length,
    server_only: classifications.filter((row) => row.category === "A").length,
    authenticated: classifications.filter((row) => row.category === "B").length,
    anon: classifications.filter((row) => row.category === "C").length,
    unknown: classifications.filter((row) => row.category === "D").length,
  },
  authenticated_retain: [...authenticatedRetain],
  anon_retain: [...anonRetain],
  search_path_unfixed: classifications.filter((row) => !row.search_path_fixed).map((row) => row.signature),
}, null, 2));
