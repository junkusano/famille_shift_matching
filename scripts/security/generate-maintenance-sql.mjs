import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const root = "C:/Users/USER/famille_shift_matching";
const snapshot = "C:/Users/USER/Downloads/supabase-pre-rls-20260824_000200";
const generated = path.join(root, "docs/security/pre-maintenance-20260825/generated");
const out = path.join(root, "supabase/maintenance/20260825");
fs.mkdirSync(out, { recursive: true });

const readCsv = (name) => parse(fs.readFileSync(path.join(generated, name), "utf8"), { columns: true, skip_empty_lines: true });
const tables = readCsv("table_rls_grant_classification.csv");
const usage = readCsv("source_supabase_usage.csv");
const views = readCsv("view_audit.csv");
const functions = readCsv("function_audit.csv");
const policies = readCsv("policy_audit.csv");

const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const relation = (name) => `public.${quote(name)}`;
const isTrue = (value) => value === true || value === "true";
const sourcePolicies = new Map();
for (const row of policies) {
  if (!sourcePolicies.has(row.table)) sourcePolicies.set(row.table, []);
  sourcePolicies.get(row.table).push(row);
}

const complexTables = new Set([
  "alert_log", "api_shift_coord_log", "assessments_records", "audit_error_log", "audit_log",
  "cm_fax_received", "cm_fax_received_offices", "cm_kaipoke_info", "cm_kaipoke_other_office",
  "cm_kaipoke_service_usage", "cs_docs", "cs_kaipoke_info", "entry_attachments", "env_variables",
  "fax", "fax_log", "form_entries", "group_lw_channel_info", "groups_lw", "groups_lw_temp",
  "orgs", "orgs_temp", "rpa_command_requests", "shift", "shift_records", "spot_offer_request_table",
  "staff_log", "user_advance_payment_applications", "users", "users_lw_temp",
]);

const rlsOff = tables.filter((row) => !isTrue(row.rls_enabled));
const rlsOn = tables.filter((row) => isTrue(row.rls_enabled));
const phaseBAllow = new Set([
  "cm_select_options", "event_task_required_docs", "event_template_required_docs",
  "msg_lw_status", "service_kinds", "shift_record_items", "system_role_master",
]);
const phaseB = rlsOff.filter((row) => phaseBAllow.has(row.table));
const phaseC = rlsOff.filter((row) => ["B", "C"].includes(row.classification) && !phaseBAllow.has(row.table) && !complexTables.has(row.table));
const phaseD = rlsOff.filter((row) => row.classification === "A" && !complexTables.has(row.table));
const assigned = new Set([...phaseB, ...phaseC, ...phaseD].map((row) => row.table));
const phaseE = rlsOff.filter((row) => !assigned.has(row.table));

const browserOps = new Map();
for (const row of usage) {
  if (row.object_type !== "TABLE_OR_VIEW" || row.catalog_match !== "yes" || !/browser|client/i.test(row.context)) continue;
  if (!browserOps.has(row.object_name)) browserOps.set(row.object_name, new Set());
  for (const op of row.operation.split("+")) if (["select", "insert", "update", "delete"].includes(op)) browserOps.get(row.object_name).add(op);
}

function phaseHeader(name, description) {
  return `-- ${name}: ${description}\n-- DRAFT: run only in the maintenance window, after backup/Gate checks.\n-- Generated from the 2026-08-24 pre-RLS snapshot.\nBEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '5min';\n\n`;
}

function enableAndRevoke(rows) {
  return rows.map((row) => `ALTER TABLE ${relation(row.table)} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL PRIVILEGES ON TABLE ${relation(row.table)} FROM anon, authenticated;`).join("\n\n") + "\n";
}

function policyName(table, command) {
  return `rls25_${table.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 42)}_${command}`;
}

function activePolicy(table, op) {
  const name = policyName(table, op);
  if (op === "select" || op === "delete") return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR ${op.toUpperCase()} TO authenticated USING (public.rls25_is_active_user());`;
  if (op === "insert") return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR INSERT TO authenticated WITH CHECK (public.rls25_is_active_user());`;
  return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR UPDATE TO authenticated USING (public.rls25_is_active_user()) WITH CHECK (public.rls25_is_active_user());`;
}

function specialPolicy(table, op) {
  const elevated = "public.rls25_has_role(ARRAY['admin','manager','full'])";
  const own = table === "shift_wishes" || table === "user_advance_payment_applications" ? `(user_id = public.rls25_current_user_id())` : null;
  const formOwn = table === "form_entries" ? `(auth_uid = auth.uid())` : null;
  const requestOwn = table === "rpa_command_requests" ? `(requester_id = public.rls25_current_user_id())` : null;
  const usersOwn = table === "users" ? `(auth_user_id = auth.uid())` : null;
  const condition = own ?? formOwn ?? requestOwn ?? usersOwn;
  if (!condition) return activePolicy(table, op);
  const readCondition = `(${condition} OR ${elevated})`;
  const writeCondition = table === "users" || table === "form_entries" ? readCondition : table === "rpa_command_requests" ? `(${condition} OR ${elevated})` : readCondition;
  const name = policyName(table, op);
  if (op === "select" || op === "delete") return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR ${op.toUpperCase()} TO authenticated USING (${op === "delete" && table === "users" ? elevated : readCondition});`;
  if (op === "insert") return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR INSERT TO authenticated WITH CHECK (${table === "form_entries" ? formOwn : table === "users" ? usersOwn : writeCondition});`;
  return `DROP POLICY IF EXISTS ${quote(name)} ON ${relation(table)};\nCREATE POLICY ${quote(name)} ON ${relation(table)} FOR UPDATE TO authenticated USING (${writeCondition}) WITH CHECK (${writeCondition});`;
}

function clientSql(rows, includeHelpers = false) {
  let sql = enableAndRevoke(rows);
  if (includeHelpers) {
    sql += `\nCREATE OR REPLACE FUNCTION public.rls25_is_active_user() RETURNS boolean\nLANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp\nAS $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND COALESCE(u.status, '') <> 'removed_from_lineworks_kaipoke') $$;\nCREATE OR REPLACE FUNCTION public.rls25_current_user_id() RETURNS text\nLANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp\nAS $$ SELECT u.user_id FROM public.users u WHERE u.auth_user_id = auth.uid() LIMIT 1 $$;\nCREATE OR REPLACE FUNCTION public.rls25_has_role(allowed text[]) RETURNS boolean\nLANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp\nAS $$ SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND lower(COALESCE(u.system_role, '')) = ANY(allowed)) $$;\nREVOKE ALL ON FUNCTION public.rls25_is_active_user() FROM PUBLIC, anon;\nREVOKE ALL ON FUNCTION public.rls25_current_user_id() FROM PUBLIC, anon;\nREVOKE ALL ON FUNCTION public.rls25_has_role(text[]) FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.rls25_is_active_user() TO authenticated;\nGRANT EXECUTE ON FUNCTION public.rls25_current_user_id() TO authenticated;\nGRANT EXECUTE ON FUNCTION public.rls25_has_role(text[]) TO authenticated;\n`;
  }
  for (const row of rows) {
    const ops = browserOps.get(row.table) ?? new Set();
    if (row.table === "user_doc_master") ops.add("select");
    if (!ops.size) continue;
    sql += `\nGRANT ${[...ops].map((op) => op.toUpperCase()).join(", ")} ON TABLE ${relation(row.table)} TO authenticated;\n`;
    if ((sourcePolicies.get(row.table)?.length ?? 0) > 0) continue;
    for (const op of [...ops].sort()) sql += specialPolicy(row.table, op) + "\n";
    if (row.table === "user_doc_master") {
      const name = policyName(row.table, "public_certificate_select");
      sql += `GRANT SELECT ON TABLE ${relation(row.table)} TO anon;\nDROP POLICY IF EXISTS ${quote(name)} ON ${relation(row.table)};\nCREATE POLICY ${quote(name)} ON ${relation(row.table)} FOR SELECT TO anon USING (is_active = true AND category = 'certificate');\n`;
    }
  }
  return sql;
}

function hardenExistingRlsSql(rows) {
  let sql = "\n-- Existing RLS-enabled tables: remove broad grants and restore only policy-backed operations.\n";
  for (const row of rows) {
    sql += `REVOKE ALL PRIVILEGES ON TABLE ${relation(row.table)} FROM anon, authenticated;\n`;
    const tablePolicies = sourcePolicies.get(row.table) ?? [];
    const allowed = new Set();
    for (const policy of tablePolicies.filter((item) => /authenticated/.test(item.roles))) {
      if (policy.command === "ALL") for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) allowed.add(op);
      else if (["SELECT", "INSERT", "UPDATE", "DELETE"].includes(policy.command)) allowed.add(policy.command);
    }
    const needed = browserOps.get(row.table) ?? new Set();
    if (!tablePolicies.length && needed.size) {
      for (const op of needed) {
        allowed.add(op.toUpperCase());
        sql += specialPolicy(row.table, op) + "\n";
      }
    }
    if (allowed.size) sql += `GRANT ${[...allowed].sort().join(", ")} ON TABLE ${relation(row.table)} TO authenticated;\n`;
  }
  return sql;
}

function linesForObjects(file, names, marker, roles) {
  const set = new Set(names);
  return fs.readFileSync(path.join(snapshot, file), "utf8").split(/\r?\n/).filter((line) => {
    if (!line) return false;
    const index = line.indexOf(marker);
    if (index < 0) return false;
    const after = line.slice(index + marker.length);
    const nameMatch = after.match(/^\"([^\"]+)\"|^([A-Za-z0-9_]+)/);
    const name = nameMatch?.[1] ?? nameMatch?.[2];
    return name && set.has(name) && roles.some((role) => line.includes(` TO ${role}`));
  }).join("\n");
}

function rollbackTables(phase, rows, generatedPolicies = true, dropHelpers = false) {
  const names = rows.map((row) => row.table);
  let sql = phaseHeader(`rollback_${phase}`, `restore ${phase} table RLS and grants`);
  if (generatedPolicies) {
    for (const name of names) for (const op of ["select", "insert", "update", "delete", "public_certificate_select"]) sql += `DROP POLICY IF EXISTS ${quote(policyName(name, op))} ON ${relation(name)};\n`;
  }
  for (const name of names) sql += `REVOKE ALL PRIVILEGES ON TABLE ${relation(name)} FROM anon, authenticated;\n`;
  sql += "\n" + linesForObjects("grants_before.sql", names, "ON TABLE public.", ["anon", "authenticated"]) + "\n\n";
  const stateLines = fs.readFileSync(path.join(snapshot, "rls_state_before.sql"), "utf8").split(/\r?\n/).filter((line) => names.some((name) => line.startsWith(`ALTER TABLE public.${name} `)));
  sql += stateLines.join("\n") + "\n";
  if (dropHelpers) sql += "DROP FUNCTION IF EXISTS public.rls25_has_role(text[]);\nDROP FUNCTION IF EXISTS public.rls25_current_user_id();\nDROP FUNCTION IF EXISTS public.rls25_is_active_user();\n";
  return sql + "COMMIT;\n";
}

function write(name, sql) {
  fs.writeFileSync(path.join(out, name), sql, "utf8");
}

write("00_preflight_read_only.sql", `-- Read-only preflight. No DDL/DML.\nSELECT count(*) FILTER (WHERE relrowsecurity) AS rls_on, count(*) FILTER (WHERE NOT relrowsecurity) AS rls_off FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r';\nSELECT count(*) AS policies FROM pg_policies WHERE schemaname='public';\nSELECT count(*) FILTER (WHERE prosecdef) AS security_definer, count(*) AS functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';\nSELECT count(*) FILTER (WHERE COALESCE((c.reloptions @> ARRAY['security_invoker=true']), false)) AS security_invoker, count(*) AS views FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v';\n`);

const definerFunctions = functions.filter((row) => isTrue(row.security_definer));
let phaseF0 = phaseHeader("Phase F0", "emergency SECURITY DEFINER anonymous lockdown before table phases");
for (const row of definerFunctions) phaseF0 += `REVOKE EXECUTE ON FUNCTION ${relation(row.function)}(${row.arguments}) FROM PUBLIC, anon;\n`;
const execSql = functions.find((row) => row.function === "exec_sql");
if (execSql) phaseF0 += `REVOKE EXECUTE ON FUNCTION ${relation(execSql.function)}(${execSql.arguments}) FROM authenticated;\n`;
phaseF0 += "COMMIT;\n";
write("05_phase_f0_emergency_rpc_lockdown.sql", phaseF0);
let rollbackF0 = phaseHeader("rollback_phase_f0", "restore SECURITY DEFINER grants from snapshot");
for (const row of definerFunctions) rollbackF0 += `REVOKE EXECUTE ON FUNCTION ${relation(row.function)}(${row.arguments}) FROM PUBLIC, anon, authenticated;\n`;
rollbackF0 += linesForObjects("routine_grants_before.sql", definerFunctions.map((row) => row.function), "ON FUNCTION public.", ["PUBLIC", "anon", "authenticated"]) + "\nCOMMIT;\n";
write("06_rollback_phase_f0.sql", rollbackF0);

write("10_phase_b_server_only_non_sensitive.sql", phaseHeader("Phase B", "server-only / unused non-sensitive tables") + enableAndRevoke(phaseB) + "COMMIT;\n");
write("11_rollback_phase_b.sql", rollbackTables("phase_b", phaseB, false));
write("20_phase_c_sensitive_server_only.sql", phaseHeader("Phase C", "sensitive server-only tables") + enableAndRevoke(phaseC) + "COMMIT;\n");
write("21_rollback_phase_c.sql", rollbackTables("phase_c", phaseC, false));
write("30_phase_d_client_rls.sql", phaseHeader("Phase D", "authenticated/browser tables and existing RLS grant hardening") + clientSql(phaseD, true) + hardenExistingRlsSql(rlsOn) + "COMMIT;\n");
write("31_rollback_phase_d.sql", rollbackTables("phase_d", [...phaseD, ...rlsOn], true, true));
write("40_phase_e_complex_business.sql", phaseHeader("Phase E", "complex business and legacy tables") + clientSql(phaseE, false) + "COMMIT;\n");
write("41_rollback_phase_e.sql", rollbackTables("phase_e", phaseE, true));

const browserViews = new Set(usage.filter((row) => row.object_type === "TABLE_OR_VIEW" && /browser|client/i.test(row.context) && views.some((view) => view.view === row.object_name)).map((row) => row.object_name));
const browserFunctions = new Set(usage.filter((row) => row.object_type === "RPC" && /browser|client/i.test(row.context)).map((row) => row.object_name));
for (const name of ["wf_is_admin", "wf_is_approver", "wf_my_user_id"]) browserFunctions.add(name);

let phaseF = phaseHeader("Phase F", "VIEW security_invoker and FUNCTION EXECUTE lockdown");
for (const row of views) {
  phaseF += `ALTER VIEW ${relation(row.view)} SET (security_invoker = true);\nREVOKE ALL PRIVILEGES ON TABLE ${relation(row.view)} FROM anon, authenticated;\n`;
  if (browserViews.has(row.view)) phaseF += `GRANT SELECT ON TABLE ${relation(row.view)} TO authenticated;\n`;
}
for (const row of functions) {
  const signature = `${relation(row.function)}(${row.arguments})`;
  phaseF += `REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;\n`;
  if (browserFunctions.has(row.function)) phaseF += `GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;\n`;
}
phaseF += "COMMIT;\n";
write("50_phase_f_views_functions.sql", phaseF);

let rollbackF = phaseHeader("rollback_phase_f", "restore VIEW options and FUNCTION/VIEW grants");
for (const row of views) rollbackF += `REVOKE ALL PRIVILEGES ON TABLE ${relation(row.view)} FROM anon, authenticated;\n`;
rollbackF += "\n" + fs.readFileSync(path.join(snapshot, "view_security_before.sql"), "utf8") + "\n";
rollbackF += linesForObjects("grants_before.sql", views.map((row) => row.view), "ON TABLE public.", ["anon", "authenticated"]) + "\n";
for (const row of functions) rollbackF += `REVOKE EXECUTE ON FUNCTION ${relation(row.function)}(${row.arguments}) FROM PUBLIC, anon, authenticated;\n`;
rollbackF += linesForObjects("routine_grants_before.sql", functions.map((row) => row.function), "ON FUNCTION public.", ["PUBLIC", "anon", "authenticated"]) + "\nCOMMIT;\n";
write("51_rollback_phase_f.sql", rollbackF);

write("60_phase_g_storage.sql", phaseHeader("Phase G", "Storage public flag hardening; no object deletion") + "UPDATE storage.buckets SET public = false WHERE id = 'uploads' AND public = true;\nCOMMIT;\n");
write("61_rollback_phase_g.sql", phaseHeader("rollback_phase_g", "restore uploads bucket public flag") + "UPDATE storage.buckets SET public = true WHERE id = 'uploads';\nCOMMIT;\n");

const generatedPolicyCount = [...phaseD, ...phaseE].reduce((count, row) => {
  if ((sourcePolicies.get(row.table)?.length ?? 0) > 0) return count;
  const ops = new Set(browserOps.get(row.table) ?? []);
  if (row.table === "user_doc_master") ops.add("select");
  return count + ops.size + (row.table === "user_doc_master" ? 1 : 0);
}, 0);
const existingRlsGapPolicyCount = rlsOn.reduce((count, row) => count + ((sourcePolicies.get(row.table)?.length ?? 0) === 0 ? (browserOps.get(row.table)?.size ?? 0) : 0), 0);
const summary = {
  phase_b_tables: phaseB.map((row) => row.table),
  phase_c_tables: phaseC.map((row) => row.table),
  phase_d_tables: phaseD.map((row) => row.table),
  phase_e_tables: phaseE.map((row) => row.table),
  rls_enable_count: rlsOff.length,
  generated_policy_count: generatedPolicyCount + existingRlsGapPolicyCount,
  existing_rls_grant_hardening_tables: rlsOn.length,
  view_change_count: views.length,
  function_revoke_targets: functions.length,
  emergency_security_definer_targets: definerFunctions.length,
  browser_view_grants: browserViews.size,
  browser_function_grants: [...browserFunctions],
  storage_change_count: 1,
};
fs.writeFileSync(path.join(out, "planned_changes.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ phaseB: phaseB.length, phaseC: phaseC.length, phaseD: phaseD.length, phaseE: phaseE.length, ...summary }, null, 2));
