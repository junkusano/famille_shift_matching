import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/USER/AppData/Local/Temp/rls-canary-pg/node_modules/pg");

const outputRoot = path.resolve("docs/security/f0-20260830");
fs.mkdirSync(outputRoot, { recursive: true });
const requestedOutput = process.argv[2] || "security-definer-before.json";
if (!/^[a-z0-9._-]+\.json$/i.test(requestedOutput)) {
  throw new Error("Output filename must be a simple JSON filename");
}
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
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

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const functions = (await client.query(`
    SELECT p.oid::text AS oid,
           p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           pg_get_function_result(p.oid) AS result_type,
           pg_get_userbyid(p.proowner) AS owner,
           p.proconfig,
           p.proacl::text AS acl,
           EXISTS (
             SELECT 1
               FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
           ) AS public_execute,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
           has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
           pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY p.proname, identity_args
  `)).rows;

  const policyDependencies = (await client.query(`
    SELECT p.oid::text AS function_oid, c.relname AS table_name, pol.polname AS policy_name
      FROM pg_policy pol
      JOIN pg_class c ON c.oid = pol.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_depend d ON d.classid = 'pg_policy'::regclass AND d.objid = pol.oid
      JOIN pg_proc p ON d.refclassid = 'pg_proc'::regclass AND d.refobjid = p.oid
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY p.oid, c.relname, pol.polname
  `)).rows;

  const triggerDependencies = (await client.query(`
    SELECT p.oid::text AS function_oid, c.relname AS table_name, t.tgname AS trigger_name
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND NOT t.tgisinternal
     ORDER BY p.oid, c.relname, t.tgname
  `)).rows;

  const enriched = functions.map((fn) => ({
    ...fn,
    search_path_fixed: Array.isArray(fn.proconfig) && fn.proconfig.some((item) => item.startsWith("search_path=")),
    policy_dependencies: policyDependencies.filter((row) => row.function_oid === fn.oid),
    trigger_dependencies: triggerDependencies.filter((row) => row.function_oid === fn.oid),
  }));
  const snapshot = {
    captured_at: new Date().toISOString(),
    source: "production direct PostgreSQL read-only transaction",
    count: enriched.length,
    functions: enriched,
  };
  fs.writeFileSync(path.join(outputRoot, requestedOutput), JSON.stringify(snapshot, null, 2));
  await client.query("ROLLBACK");
  console.log(JSON.stringify({
    ok: true,
    captured_at: snapshot.captured_at,
    count: snapshot.count,
    grants: {
      public: enriched.filter((fn) => fn.public_execute).length,
      anon: enriched.filter((fn) => fn.anon_execute).length,
      authenticated: enriched.filter((fn) => fn.authenticated_execute).length,
      service_role: enriched.filter((fn) => fn.service_role_execute).length,
    },
    search_path_fixed: enriched.filter((fn) => fn.search_path_fixed).length,
    search_path_unfixed: enriched.filter((fn) => !fn.search_path_fixed).map((fn) => `${fn.name}(${fn.identity_args})`),
    policy_dependencies: policyDependencies,
    trigger_dependencies: triggerDependencies,
  }, null, 2));
} finally {
  await client.end().catch(() => {});
}
