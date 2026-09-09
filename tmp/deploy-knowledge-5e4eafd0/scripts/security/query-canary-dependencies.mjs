import { createRequire } from "node:module";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { Client } = require("C:/Users/USER/AppData/Local/Temp/rls-canary-pg/node_modules/pg");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const client = new Client({
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  const result = await client.query(`
    SELECT confrelid::regclass::text AS referenced_table,
           conrelid::regclass::text AS referencing_table,
           conname,
           pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint
     WHERE contype = 'f'
       AND confrelid = ANY(ARRAY[
         'public.msg_lw_status'::regclass,
         'public.system_role_master'::regclass
       ])
     ORDER BY 1, 2, 3
  `);
  await client.query("ROLLBACK");
  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end().catch(() => {});
}
