import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

test('事務募集はservice登録・資格不要・シフトなし・1枠・対応ひな型を必須にする', async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href);
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE TABLE spot_offer_template_unified(core_id uuid PRIMARY KEY,kaipoke_cs_id text,requires_license boolean,required_licenses text[]);
   CREATE TABLE spot_offer_request_table(id uuid PRIMARY KEY,core_id uuid,kaipoke_cs_id text,shift_id bigint,shift_start_date date,shift_start_time time,shift_end_time time);`);
  await db.exec(fs.readFileSync('supabase/migrations/202610241200_office_recruitment.sql','utf8'));
  const core='00000000-0000-4000-8000-000000000001',request='00000000-0000-4000-8000-000000000002';
  await assert.rejects(db.query("INSERT INTO spot_offer_template_unified(core_id,recruitment_kind,requires_license) VALUES($1,'office',true)",[core]));
  await db.query("INSERT INTO spot_offer_template_unified(core_id,recruitment_kind,requires_license) VALUES($1,'office',false)",[core]);
  const insert="INSERT INTO spot_offer_request_table(id,core_id,recruitment_kind,office_headcount,office_mail_after,shift_start_date,shift_start_time,shift_end_time) VALUES($1,$2,'office',$3,now(),'2099-01-02','11:00','13:00')";
  await assert.rejects(db.query(insert,[request,core,3]));
  await assert.rejects(db.query(insert,[request,'00000000-0000-4000-8000-000000000003',1]));
  await db.query(insert,[request,core,1]);
  await assert.rejects(db.query('UPDATE spot_offer_request_table SET shift_id=123 WHERE id=$1',[request]));
  await assert.rejects(db.query("UPDATE spot_offer_request_table SET kaipoke_cs_id='123' WHERE id=$1",[request]));
  await db.exec('GRANT SELECT,INSERT,UPDATE ON spot_offer_template_unified,spot_offer_request_table TO authenticated;SET ROLE authenticated');
  await assert.rejects(db.query("INSERT INTO spot_offer_template_unified(core_id,recruitment_kind,requires_license) VALUES('00000000-0000-4000-8000-000000000004','office',false)"),/OFFICE_REGISTRATION_REQUIRES_SERVICE_ROLE/);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int n FROM spot_offer_request_table')).rows[0].n,1);
 } finally {await db.close();}
});
