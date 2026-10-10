import fs from "node:fs";
import { createRequire } from "node:module";

function envValue(name) {
  const files = [".env.local", ".env"];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const line = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((value) => value.startsWith(`${name}=`));
    if (!line) continue;
    const value = line.slice(name.length + 1).trim();
    if (value) return value.replace(/^['"]|['"]$/g, "");
  }
  return process.env[name]?.trim() ?? "";
}

const require = createRequire(import.meta.url);
const { Client } = require("../tmp/monitoring-tools/node_modules/pg");
const supabaseUrl = envValue("NEXT_PUBLIC_SUPABASE_URL");
const password = envValue("SUPABASE_DB_PASSWORD");
if (!supabaseUrl || !password) throw new Error(".envのSupabase DB接続情報が不足しています");

const project = new URL(supabaseUrl).hostname.split(".")[0];
const client = new Client({
  host: "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${project}`,
  password,
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});
const migration = fs.readFileSync("supabase/migrations/202610100900_monitoring_email_delivery.sql", "utf8");
const apply = process.argv.includes("--apply");

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(migration);
  const columns = await client.query(`
    select column_name, is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monitoring_fax_history'
      and column_name in ('fax_number', 'delivery_method', 'email_address')
    order by column_name
  `);
  const found = Object.fromEntries(columns.rows.map((row) => [row.column_name, row.is_nullable]));
  if (found.fax_number !== "YES" || found.delivery_method === undefined || found.email_address === undefined) {
    throw new Error("メール送付用のDB更新を確認できませんでした");
  }
  if (apply) {
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify({ ok: true, applied: apply, columns: found }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
