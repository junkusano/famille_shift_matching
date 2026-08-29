import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/USER/AppData/Local/Temp/rls-canary-pg/node_modules/pg");

const candidates = [
  "cm_select_options",
  "event_task_required_docs",
  "event_template_required_docs",
  "msg_lw_status",
  "service_kinds",
  "shift_record_items",
  "system_role_master",
];

const outputRoot = path.resolve("docs/security/rls-canary-20260830");
fs.mkdirSync(outputRoot, { recursive: true });
const requestedOutput = process.argv[2] || "production-catalog-before.json";
if (!/^[a-z0-9._-]+\.json$/i.test(requestedOutput)) {
  throw new Error("Output filename must be a simple JSON filename");
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl || !process.env.SUPABASE_DB_PASSWORD) {
  throw new Error("Required Supabase connection settings are missing");
}
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const client = new Client({
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

const query = async (text, values = []) => (await client.query(text, values)).rows;

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");

  const tables = await query(`
    SELECT c.oid::text AS oid, n.nspname AS schema, c.relname AS name,
           c.relkind, pg_get_userbyid(c.relowner) AS owner,
           c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           c.relacl::text AS acl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm')
     ORDER BY c.relkind, c.relname
  `);

  const policies = await query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
     ORDER BY tablename, policyname
  `);

  const tableGrants = await query(`
    SELECT grantee, table_schema, table_name, privilege_type, is_grantable
      FROM information_schema.table_privileges
     WHERE table_schema = 'public'
     ORDER BY table_name, grantee, privilege_type
  `);

  const functions = await query(`
    SELECT p.oid::text AS oid, n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS security_definer,
           p.proacl::text AS acl,
           pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
     ORDER BY p.proname, identity_args
  `);

  const routineGrants = await query(`
    SELECT grantor, grantee, routine_schema, routine_name, specific_name,
           privilege_type, is_grantable
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'public'
     ORDER BY routine_name, specific_name, grantee
  `);

  const views = await query(`
    SELECT c.oid::text AS oid, c.relname AS name,
           pg_get_userbyid(c.relowner) AS owner,
           COALESCE(c.reloptions @> ARRAY['security_invoker=true'], false) AS security_invoker,
           pg_get_viewdef(c.oid, true) AS definition
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
     ORDER BY c.relname
  `);

  const triggers = await query(`
    SELECT event_object_table AS table_name, trigger_name, action_timing,
           event_manipulation, action_statement
      FROM information_schema.triggers
     WHERE trigger_schema = 'public'
     ORDER BY event_object_table, trigger_name, event_manipulation
  `);

  const publicationTables = await query(`
    SELECT pubname, schemaname, tablename
      FROM pg_publication_tables
     WHERE schemaname = 'public'
     ORDER BY pubname, tablename
  `);

  const candidateDetails = {};
  for (const table of candidates) {
    const relation = tables.find((row) => row.relkind === "r" && row.name === table);
    if (!relation) {
      candidateDetails[table] = { exists: false };
      continue;
    }
    const [{ count }] = await query(`SELECT count(*)::bigint::text AS count FROM public."${table}"`);
    const columns = await query(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position
    `, [table]);
    const constraints = await query(`
      SELECT conname AS name, contype AS type, pg_get_constraintdef(oid, true) AS definition
        FROM pg_constraint
       WHERE conrelid = $1::regclass
       ORDER BY conname
    `, [`public.${table}`]);
    const indexes = await query(`
      SELECT indexname AS name, indexdef AS definition
        FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname
    `, [table]);
    const dependentViews = await query(`
      SELECT DISTINCT v.relname AS view_name
        FROM pg_rewrite rw
        JOIN pg_class v ON v.oid = rw.ev_class
        JOIN pg_namespace vn ON vn.oid = v.relnamespace
        JOIN pg_depend d ON d.objid = rw.oid
       WHERE d.refobjid = $1::regclass
         AND vn.nspname = 'public'
         AND v.relkind IN ('v', 'm')
       ORDER BY v.relname
    `, [`public.${table}`]);
    const functionReferences = functions
      .filter((fn) => new RegExp(`\\b${table}\\b`, "i").test(fn.definition))
      .map(({ name, identity_args, security_definer }) => ({ name, identity_args, security_definer }));

    candidateDetails[table] = {
      exists: true,
      relation,
      row_count: Number(count),
      policies: policies.filter((row) => row.tablename === table),
      grants: tableGrants.filter((row) => row.table_name === table),
      columns,
      constraints,
      indexes,
      triggers: triggers.filter((row) => row.table_name === table),
      realtime: publicationTables.filter((row) => row.tablename === table),
      dependent_views: dependentViews,
      function_references: functionReferences,
    };
  }

  const snapshot = {
    captured_at: new Date().toISOString(),
    source: "production direct PostgreSQL read-only transaction",
    summary: {
      relations: tables.length,
      tables: tables.filter((row) => row.relkind === "r").length,
      views: tables.filter((row) => row.relkind === "v").length,
      materialized_views: tables.filter((row) => row.relkind === "m").length,
      rls_enabled: tables.filter((row) => row.relkind === "r" && row.rls_enabled).length,
      rls_disabled: tables.filter((row) => row.relkind === "r" && !row.rls_enabled).length,
      policies: policies.length,
      functions: functions.length,
      security_definer: functions.filter((row) => row.security_definer).length,
      table_grants: tableGrants.length,
      routine_grants: routineGrants.length,
    },
    tables,
    policies,
    table_grants: tableGrants,
    functions,
    routine_grants: routineGrants,
    views,
    triggers,
    publication_tables: publicationTables,
    candidates: candidateDetails,
  };

  fs.writeFileSync(path.join(outputRoot, requestedOutput), JSON.stringify(snapshot, null, 2));
  await client.query("ROLLBACK");
  console.log(JSON.stringify({ ok: true, captured_at: snapshot.captured_at, summary: snapshot.summary, candidates: Object.fromEntries(Object.entries(candidateDetails).map(([name, value]) => [name, {
    exists: value.exists,
    row_count: value.row_count,
    rls_enabled: value.relation?.rls_enabled,
    policy_count: value.policies?.length,
    grant_count: value.grants?.length,
    trigger_count: value.triggers?.length,
    realtime_count: value.realtime?.length,
    dependent_views: value.dependent_views?.map((row) => row.view_name),
    function_references: value.function_references,
  }])) }, null, 2));
} finally {
  await client.end().catch(() => {});
}
