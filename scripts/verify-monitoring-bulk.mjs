import fs from 'node:fs';
import { createRequire } from 'node:module';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const { Client } = require('../tmp/monitoring-tools/node_modules/pg');
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
const client = new Client({ host: 'aws-0-ap-southeast-1.pooler.supabase.com', port: 5432, user: `postgres.${project}`, password: process.env.SUPABASE_DB_PASSWORD, database: 'postgres', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const sql = fs.readFileSync('supabase/migrations/202609092200_monitoring_bulk_runs.sql', 'utf8');
const apply = process.argv.includes('--apply');
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query(sql.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
  await client.query('SAVEPOINT test_data');
  const run = (await client.query(`insert into public.monitoring_bulk_runs(target_month,period_start,period_end,evaluation_date,event_template_id,created_by)
    select '1900-01','1900-01-01','1900-01-31','1900-02-01',id,'bulk-test' from public.event_template
    where template_name = 'マネジャー向け具体的な書類等対応（シフトアラート連動）' returning id`)).rows[0];
  if (!run) throw new Error('Event template missing');
  await client.query("insert into public.monitoring_bulk_run_items(run_id,client_info_id,kaipoke_cs_id) values($1,'bulk-test-1','bulk-test-1'),($1,'bulk-test-2','bulk-test-2')", [run.id]);
  const first = (await client.query('select * from public.claim_monitoring_bulk_item($1)', [run.id])).rows;
  const second = (await client.query('select * from public.claim_monitoring_bulk_item($1)', [run.id])).rows;
  if (first.length !== 1 || second.length !== 0) throw new Error('Claim did not prevent parallel processing');
  await client.query("update public.monitoring_bulk_run_items set status = 'sent' where id = $1", [first[0].id]);
  const next = (await client.query('select * from public.claim_monitoring_bulk_item($1)', [run.id])).rows;
  if (next.length !== 1 || next[0].id === first[0].id) throw new Error('Claim repeated sent item');
  for (const role of ['anon','authenticated']) {
    const result = (await client.query("select has_table_privilege($1,'public.monitoring_bulk_runs','SELECT') as allowed", [role])).rows[0];
    if (result.allowed) throw new Error('Browser role has direct access');
  }
  await client.query('ROLLBACK TO SAVEPOINT test_data');
  if (apply) {
    await client.query("NOTIFY pgrst, 'reload schema'");
    await client.query('COMMIT');
  } else await client.query('ROLLBACK');
  console.log(JSON.stringify({ ok: true, applied: apply, verified: ['migration', 'single claim', 'no replay', 'browser access denied'], testDataPersisted: false }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally { await client.end(); }
