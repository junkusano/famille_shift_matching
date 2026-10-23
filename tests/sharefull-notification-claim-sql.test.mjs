import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
test('通知claim RPCは更新した行を正しく返し、重複・未失効claim・未許可テーブルを拒否する',async()=>{
 const module=process.env.PGLITE_MODULE_PATH||'.artifacts/confirmation-sql-tools/node_modules/@electric-sql/pglite/dist/index.js';
 const {PGlite}=await import(pathToFileURL(resolve(module)).href),db=new PGlite();
 try{
  await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  const tables=['spot_offer_application_events','sharefull_rpa_test_spot_offer_application_events'];
  for(const table of tables)await db.exec(`CREATE TABLE ${table}(provider text,event_id text,notified_at timestamptz,notification_claimed_at timestamptz,notification_error text,PRIMARY KEY(provider,event_id));INSERT INTO ${table}(provider,event_id) VALUES('sharefull','mail-1');`);
  await db.exec(fs.readFileSync('supabase/migrations/202610231500_sharefull_notification_claim_rpc.sql','utf8'));
  const claim=async(table)=>(await db.query('SELECT claim_sharefull_application_notification($1,$2,$3) AS claimed',['sharefull','mail-1',table])).rows[0].claimed;
  for(const table of tables){
   assert.equal(await claim(table),true);
   assert.equal(await claim(table),false);
   await db.exec(`UPDATE ${table} SET notification_claimed_at=now()-interval '6 minutes';`);
   assert.equal(await claim(table),true);
   await db.exec(`UPDATE ${table} SET notified_at=now(),notification_claimed_at=NULL;`);
   assert.equal(await claim(table),false);
  }
  await assert.rejects(claim('other_table'),/Unsupported notification event table/);
  for(const role of ['anon','authenticated']){
   assert.equal((await db.query("SELECT has_function_privilege($1,'claim_sharefull_application_notification(text,text,text)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
  }
  assert.equal((await db.query("SELECT has_function_privilege('service_role','claim_sharefull_application_notification(text,text,text)','EXECUTE') AS allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
