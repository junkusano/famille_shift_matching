import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/USER/AppData/Local/Temp/rls-canary-pg/node_modules/pg");

const TABLE = "msg_lw_status";
const ALL_PRIVILEGES = ["DELETE", "INSERT", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"];
const mode = process.argv[2];
if (!["dry-run", "apply", "verify", "rollback", "role-tests"].includes(mode)) {
  throw new Error("Mode must be dry-run, apply, verify, rollback, or role-tests");
}

const outputRoot = path.resolve("docs/security/rls-canary-20260830");
const before = JSON.parse(fs.readFileSync(path.join(outputRoot, "msg_lw_status-before.json"), "utf8"));
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
  const relation = (await client.query(`
    SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'
  `, [TABLE])).rows[0];
  const policies = (await client.query(`
    SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public' AND tablename = $1
     ORDER BY policyname
  `, [TABLE])).rows;
  const grants = (await client.query(`
    SELECT grantee, privilege_type
      FROM information_schema.table_privileges
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY grantee, privilege_type
  `, [TABLE])).rows;
  const count = Number((await client.query(`SELECT count(*)::bigint::text AS count FROM public.${TABLE}`)).rows[0].count);
  return { relation, policies, grants, row_count: count };
}

function privilegesFor(state, role) {
  return state.grants.filter((row) => row.grantee === role).map((row) => row.privilege_type).sort();
}

function assertBefore(state) {
  assert(state.relation?.rls_enabled === false, "Precondition failed: RLS is not OFF");
  assert(state.policies.length === 0, "Precondition failed: unexpected policy exists");
  assert(state.row_count === before.row_count, "Precondition failed: row count changed");
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert(JSON.stringify(privilegesFor(state, role)) === JSON.stringify(ALL_PRIVILEGES), `Precondition failed: ${role} grants changed`);
  }
}

function assertAfter(state) {
  assert(state.relation?.rls_enabled === true, "Postcondition failed: RLS is not ON");
  assert(state.policies.length === 0, "Postcondition failed: unexpected policy exists");
  assert(state.row_count === before.row_count, "Postcondition failed: row count changed");
  assert(privilegesFor(state, "anon").length === 0, "Postcondition failed: anon grant remains");
  assert(privilegesFor(state, "authenticated").length === 0, "Postcondition failed: authenticated grant remains");
  assert(JSON.stringify(privilegesFor(state, "service_role")) === JSON.stringify(ALL_PRIVILEGES), "Postcondition failed: service_role grants changed");
}

async function applyStatements(client) {
  await client.query(`ALTER TABLE public.${TABLE} ENABLE ROW LEVEL SECURITY`);
  await client.query(`REVOKE ALL PRIVILEGES ON TABLE public.${TABLE} FROM anon, authenticated`);
}

async function rollbackStatements(client) {
  await client.query(`ALTER TABLE public.${TABLE} DISABLE ROW LEVEL SECURITY`);
  await client.query(`GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.${TABLE} TO anon`);
  await client.query(`GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.${TABLE} TO authenticated`);
}

async function runRoleOperation(client, role, label, sql) {
  await client.query("SAVEPOINT canary_operation");
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    const result = await client.query(sql);
    await client.query("RESET ROLE");
    await client.query("RELEASE SAVEPOINT canary_operation");
    return { role, operation: label, allowed: true, row_count: result.rowCount ?? result.rows?.length ?? null, sqlstate: null };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT canary_operation");
    await client.query("RESET ROLE");
    await client.query("RELEASE SAVEPOINT canary_operation");
    return { role, operation: label, allowed: false, row_count: null, sqlstate: error.code ?? null, message: error.code === "42501" ? "permission denied" : "database error" };
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
    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log(JSON.stringify({ ok: true, mode, state: {
      rls_enabled: state.relation.rls_enabled,
      policy_count: state.policies.length,
      anon_privileges: privilegesFor(state, "anon"),
      authenticated_privileges: privilegesFor(state, "authenticated"),
      service_role_privileges: privilegesFor(state, "service_role"),
      row_count: state.row_count,
    } }, null, 2));
  } else if (mode === "dry-run") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '2min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rls-canary-public-msg_lw_status'))");
    const initial = await readState(client);
    assertBefore(initial);
    await applyStatements(client);
    const applied = await readState(client);
    assertAfter(applied);
    await rollbackStatements(client);
    const restored = await readState(client);
    assertBefore(restored);
    await client.query("ROLLBACK");
    transactionOpen = false;
    const result = { ok: true, mode, persistent_change: false, apply_verified: true, rollback_verified: true, row_count_unchanged: true };
    fs.writeFileSync(path.join(outputRoot, "rollback-dry-run-result.json"), JSON.stringify({ ...result, tested_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === "apply") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '2min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rls-canary-public-msg_lw_status'))");
    assertBefore(await readState(client));
    await applyStatements(client);
    assertAfter(await readState(client));
    await client.query("COMMIT");
    transactionOpen = false;
    const result = { ok: true, mode, committed: true, table: `public.${TABLE}`, changed_tables: 1 };
    fs.writeFileSync(path.join(outputRoot, "apply-result.json"), JSON.stringify({ ...result, applied_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else if (mode === "rollback") {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '2min'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rls-canary-public-msg_lw_status'))");
    assertAfter(await readState(client));
    await rollbackStatements(client);
    assertBefore(await readState(client));
    await client.query("COMMIT");
    transactionOpen = false;
    const result = { ok: true, mode, committed: true, restored: true, table: `public.${TABLE}` };
    fs.writeFileSync(path.join(outputRoot, "rollback-result.json"), JSON.stringify({ ...result, rolled_back_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } else {
    await client.query("BEGIN");
    transactionOpen = true;
    assertAfter(await readState(client));
    const tests = [];
    for (const role of ["anon", "authenticated"]) {
      tests.push(await runRoleOperation(client, role, "SELECT", `SELECT id FROM public.${TABLE} LIMIT 1`));
      tests.push(await runRoleOperation(client, role, "INSERT", `INSERT INTO public.${TABLE} (id, label) SELECT -32768, '__rls_canary__' WHERE false`));
      tests.push(await runRoleOperation(client, role, "UPDATE", `UPDATE public.${TABLE} SET label = label WHERE id = -32768`));
      tests.push(await runRoleOperation(client, role, "DELETE", `DELETE FROM public.${TABLE} WHERE id = -32768`));
    }
    const service = await runRoleOperation(client, "service_role", "SELECT", `SELECT id FROM public.${TABLE} ORDER BY id LIMIT 1`);
    tests.push(service);
    await client.query("ROLLBACK");
    transactionOpen = false;
    const denied = tests.filter((test) => ["anon", "authenticated"].includes(test.role));
    assert(denied.every((test) => !test.allowed && test.sqlstate === "42501"), "A browser-role operation was not denied with 42501");
    assert(service.allowed, "service_role SELECT failed");
    const result = { ok: true, mode, persistent_data_change: false, tests };
    fs.writeFileSync(path.join(outputRoot, "role-test-result.json"), JSON.stringify({ ...result, tested_at: new Date().toISOString() }, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ ok: false, mode, code: error.code ?? null, message: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
