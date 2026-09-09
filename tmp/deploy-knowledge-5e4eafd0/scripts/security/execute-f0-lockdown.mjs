import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/USER/AppData/Local/Temp/rls-canary-pg/node_modules/pg");

const mode = process.argv[2];
if (!["dry-run", "apply", "verify", "rollback", "role-tests"].includes(mode)) {
  throw new Error("Mode must be dry-run, apply, verify, rollback, or role-tests");
}
const reportRoot = path.resolve("docs/security/f0-20260830");
const before = JSON.parse(fs.readFileSync(path.join(reportRoot, "security-definer-before.json"), "utf8"));
const classification = JSON.parse(fs.readFileSync(path.join(reportRoot, "classification.json"), "utf8"));
if (before.count !== 35 || classification.counts.total !== 35 || classification.counts.unknown !== 0) {
  throw new Error("F0 guard failed: classification is incomplete");
}

const targetBySignature = new Map(classification.functions.map((row) => [row.signature, row]));
const signature = (fn) => `${fn.name}(${fn.identity_args})`;
const sqlSignature = (fn) => `public."${fn.name.replaceAll('"', '""')}"(${fn.identity_args})`;
const roleSql = (fn, role, allowed) => `${allowed ? "GRANT" : "REVOKE"} EXECUTE ON FUNCTION ${sqlSignature(fn)} ${allowed ? "TO" : "FROM"} ${role}`;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const connection = {
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readState(client) {
  return (await client.query(`
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           EXISTS (
             SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
           ) AS public_execute,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY p.proname, identity_args
  `)).rows;
}

function assertState(actual, expectedKind) {
  assert(actual.length === 35, `Expected 35 SECURITY DEFINER functions, got ${actual.length}`);
  for (const fn of actual) {
    const sig = signature(fn);
    const source = before.functions.find((row) => signature(row) === sig);
    const target = targetBySignature.get(sig);
    assert(source && target, `Unexpected function signature: ${sig}`);
    const expected = expectedKind === "before" ? {
      PUBLIC: source.public_execute,
      anon: source.anon_execute,
      authenticated: source.authenticated_execute,
      service_role: source.service_role_execute,
    } : target.retain;
    assert(fn.public_execute === expected.PUBLIC, `${sig}: PUBLIC mismatch`);
    assert(fn.anon_execute === expected.anon, `${sig}: anon mismatch`);
    assert(fn.authenticated_execute === expected.authenticated, `${sig}: authenticated mismatch`);
    assert(fn.service_role_execute === expected.service_role, `${sig}: service_role mismatch`);
  }
}

async function applyStatements(client) {
  for (const fn of before.functions) {
    const target = targetBySignature.get(signature(fn));
    await client.query(roleSql(fn, "PUBLIC", target.retain.PUBLIC));
    await client.query(roleSql(fn, "anon", target.retain.anon));
    await client.query(roleSql(fn, "authenticated", target.retain.authenticated));
    await client.query(roleSql(fn, "service_role", target.retain.service_role));
  }
}

async function rollbackStatements(client) {
  for (const fn of before.functions) {
    await client.query(roleSql(fn, "PUBLIC", fn.public_execute));
    await client.query(roleSql(fn, "anon", fn.anon_execute));
    await client.query(roleSql(fn, "authenticated", fn.authenticated_execute));
    await client.query(roleSql(fn, "service_role", fn.service_role_execute));
  }
}

async function roleCall(client, role, label, sql) {
  await client.query("SAVEPOINT f0_call");
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    if (role === "authenticated") {
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true)`);
    }
    await client.query(sql);
    await client.query("RESET ROLE");
    await client.query("RELEASE SAVEPOINT f0_call");
    return { role, label, allowed: true, sqlstate: null };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT f0_call");
    await client.query("RESET ROLE");
    await client.query("RELEASE SAVEPOINT f0_call");
    return { role, label, allowed: false, sqlstate: error.code ?? null, message: error.code === "42501" ? "permission denied" : "database error" };
  }
}

const client = new Client(connection);
let transactionOpen = false;
try {
  await client.connect();
  if (mode === "verify") {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    const state = await readState(client);
    assertState(state, "after");
    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log(JSON.stringify({
      ok: true,
      mode,
      count: state.length,
      public_execute: state.filter((fn) => fn.public_execute).length,
      anon_execute: state.filter((fn) => fn.anon_execute).length,
      authenticated_execute: state.filter((fn) => fn.authenticated_execute).map((fn) => signature(fn)),
      service_role_execute: state.filter((fn) => fn.service_role_execute).length,
    }, null, 2));
  } else if (mode === "dry-run") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('f0-security-definer-lockdown-20260830'))");
    assertState(await readState(client), "before");
    await applyStatements(client);
    assertState(await readState(client), "after");
    await rollbackStatements(client);
    assertState(await readState(client), "before");
    await client.query("ROLLBACK");
    transactionOpen = false;
    const result = { ok: true, mode, persistent_change: false, apply_verified: true, rollback_verified: true, function_count: 35 };
    fs.writeFileSync(path.join(reportRoot, "rollback-dry-run-result.json"), JSON.stringify({ ...result, tested_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === "apply") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('f0-security-definer-lockdown-20260830'))");
    assertState(await readState(client), "before");
    await applyStatements(client);
    assertState(await readState(client), "after");
    await client.query("COMMIT");
    transactionOpen = false;
    const result = { ok: true, mode, committed: true, target_count: 35, changed_function_count: 33 };
    fs.writeFileSync(path.join(reportRoot, "apply-result.json"), JSON.stringify({ ...result, applied_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === "rollback") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '5min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('f0-security-definer-lockdown-20260830'))");
    assertState(await readState(client), "after");
    await rollbackStatements(client);
    assertState(await readState(client), "before");
    await client.query("COMMIT");
    transactionOpen = false;
    const result = { ok: true, mode, committed: true, restored: true, target_count: 35 };
    fs.writeFileSync(path.join(reportRoot, "rollback-result.json"), JSON.stringify({ ...result, rolled_back_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else {
    await client.query("BEGIN");
    transactionOpen = true;
    assertState(await readState(client), "after");
    const tests = [];
    tests.push(await roleCall(client, "anon", "exec_sql denied", `SELECT public.exec_sql('SELECT 1')`));
    tests.push(await roleCall(client, "authenticated", "exec_sql denied", `SELECT public.exec_sql('SELECT 1')`));
    tests.push(await roleCall(client, "service_role", "exec_sql service SELECT 1", `SELECT public.exec_sql('SELECT 1')`));
    tests.push(await roleCall(client, "authenticated", "cm_get_alert_stats", `SELECT count(*) FROM public.cm_get_alert_stats()`));
    tests.push(await roleCall(client, "authenticated", "wf_is_admin", `SELECT public.wf_is_admin()`));
    tests.push(await roleCall(client, "authenticated", "wf_is_approver", `SELECT public.wf_is_approver()`));
    tests.push(await roleCall(client, "authenticated", "wf_my_user_id", `SELECT public.wf_my_user_id()`));
    await client.query("ROLLBACK");
    transactionOpen = false;
    const denied = tests.filter((row) => row.label === "exec_sql denied");
    const allowed = tests.filter((row) => row.label !== "exec_sql denied");
    assert(denied.every((row) => !row.allowed && row.sqlstate === "42501"), "exec_sql was not denied to a browser role");
    assert(allowed.every((row) => row.allowed), "A retained function call failed");
    const result = { ok: true, mode, persistent_change: false, tests };
    fs.writeFileSync(path.join(reportRoot, "role-test-result.json"), JSON.stringify({ ...result, tested_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ ok: false, mode, code: error.code ?? null, message: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
