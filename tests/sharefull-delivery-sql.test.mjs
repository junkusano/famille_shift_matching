import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('SQL: 受領保存・停止登録の冪等性・逆順取消・未実行指示の取消・ロール権限',async()=>{
 const path=process.env.PGLITE_MODULE_PATH || '.artifacts/confirmation-sql-tools/node_modules/@electric-sql/pglite/dist/index.js';
 const {PGlite}=await import(pathToFileURL(resolve(path)).href),db=new PGlite();
 const request='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002';
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE spot_offer_request_table(id uuid PRIMARY KEY,status text,applicant_name text,applicant_sex text,applicant_control_url text,updated_at timestamptz,created_at timestamptz,sharefull_job_id text,sharefull_order_id text,sharefull_status text,sharefull_sync_error text,taimee_job_id text,applicant_source text,application_state text,application_conflict boolean,recruitment_paused boolean,recruitment_revision bigint DEFAULT 0);
   CREATE TABLE rpa_runner_jobs(id uuid PRIMARY KEY,claimed_runner_id text,status text,job_type text,payload jsonb,result jsonb,completed_at timestamptz);
   CREATE TABLE rpa_command_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),template_id uuid,requester_id uuid,approver_id uuid,approved_at timestamptz,request_details jsonb,status text,updated_at timestamptz);
   CREATE TABLE dummy_shift(id uuid);CREATE VIEW shift_self_coordinate_card_view2 AS SELECT d.id,s.applicant_control_url FROM dummy_shift d LEFT JOIN spot_offer_request_table s ON d.id=s.id;`);
  for(const f of ['202609080900_spot_provider_sync.sql','202610151400_sharefull_application_notification_claims.sql','202610221900_sharefull_mail_delivery.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
  await db.query("INSERT INTO spot_offer_request_table(id,status,taimee_job_id) VALUES($1,'募集中','5678')",[request]);
  const event=async(key,id,state,time)=>(await db.query('SELECT record_spot_offer_application($1,$2,$3,$4,$5,$6)',[request,'sharefull',key,id,state,time])).rows[0].record_spot_offer_application;
  const queue=async(key,id,time)=>(await db.query('SELECT enqueue_sharefull_confirmation_close($1,$2,$3,$4,$5,$6)',[request,key,id,time,user,JSON.stringify({spot_offer_request:{id:request},taimee_job_id:'wrong-snapshot'})])).rows[0].enqueue_sharefull_confirmation_close;
  const time='2026-10-22T01:00Z',later='2026-10-22T02:00Z';
  await event('app1','confirm1','confirmed',time);
  const one=await queue('app1','confirm1',time),two=await queue('app1','confirm1',time);
  assert.equal(one.outcome,'queued');assert.equal(two.close_request_id,one.close_request_id);
  let command=(await db.query('SELECT * FROM rpa_command_requests')).rows[0];assert.equal(command.request_details.taimee_job_id,'5678');
  assert.equal((await db.query('SELECT count(*)::int n FROM rpa_command_requests')).rows[0].n,1);
  await event('app1','cancel1','cancelled',later);
  assert.equal((await db.query('SELECT status FROM rpa_command_requests')).rows[0].status,'cancelled');
  assert.equal((await queue('app1','confirm1',time)).outcome,'stale');
  // 確定を取り逃した取消を先に保存しても、後着する旧確定は無効になる。
  await event('app2','cancel2','cancelled',later);
  assert.equal((await event('app2','confirm2','confirmed',time)).stale,true);
  assert.equal((await queue('app2','confirm2',time)).outcome,'stale');
  // ID未紐付けは黙って成功せず、修復後の同メール再送で一件だけ作成できる。
  await db.query("UPDATE spot_offer_request_table SET taimee_job_id='' WHERE id=$1",[request]);
  await event('app3','confirm3','confirmed',time);
  assert.equal((await queue('app3','confirm3',time)).outcome,'target_missing');
  await db.query("UPDATE spot_offer_request_table SET taimee_job_id='5678' WHERE id=$1",[request]);
  assert.equal((await event('app3','confirm3','confirmed',time)).duplicate,true);
  const repaired=await queue('app3','confirm3',time);assert.equal(repaired.outcome,'queued');
  await db.query("UPDATE rpa_command_requests SET status='done' WHERE id=$1",[repaired.close_request_id]);
  assert.equal((await queue('app3','confirm3',time)).close_request_id,repaired.close_request_id);
  // 既に実行開始した指示を取消済みと偽装しない。
  await event('app4','confirm4','confirmed',time);const running=await queue('app4','confirm4',time);
  await db.query("UPDATE rpa_command_requests SET status='running' WHERE id=$1",[running.close_request_id]);await event('app4','cancel4','cancelled',later);
  assert.equal((await db.query('SELECT status FROM rpa_command_requests WHERE id=$1',[running.close_request_id])).rows[0].status,'running');
  await db.query("INSERT INTO spot_offer_mail_receipts(provider,event_id,event_kind,payload_hash,occurred_at) VALUES('sharefull','mail1','confirmed','hash',$1)",[time]);
  await db.query("INSERT INTO spot_offer_mail_receipts(provider,event_id,event_kind,payload_hash,occurred_at) VALUES('sharefull','mail1','confirmed','hash',$1) ON CONFLICT DO NOTHING",[time]);
  assert.equal((await db.query('SELECT count(*)::int n FROM spot_offer_mail_receipts')).rows[0].n,1);
  const rights=(await db.query("SELECT has_table_privilege('anon','spot_offer_mail_receipts','SELECT') anon_read,has_table_privilege('authenticated','spot_offer_mail_receipts','SELECT') user_read,has_function_privilege('authenticated','enqueue_sharefull_confirmation_close(uuid,text,text,timestamptz,uuid,jsonb)','EXECUTE') user_execute")).rows[0];
  assert.equal(rights.anon_read,false);assert.equal(rights.user_read,false);assert.equal(rights.user_execute,false);
 } finally {await db.close();}
});
