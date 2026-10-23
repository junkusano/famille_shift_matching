import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
test('SQL: 宛先別の原子的claim・期限切れ結果不明・送信済み維持・受信種別・権限',async()=>{
 const {PGlite}=await import(pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href),db=new PGlite();
 try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec(fs.readFileSync('supabase/migrations/202610240900_spot_notification_recipients.sql','utf8'));
 const claim=async(type,id)=>(await db.query('select claim_spot_notification_delivery($1,$2,$3) as result',['event',type,id])).rows[0].result;
 assert.equal(await claim('channel','existing'),'claimed');assert.equal(await claim('channel','existing'),'busy');
 assert.equal(await claim('user','additional'),'claimed');
 await db.exec("update spot_notification_deliveries set status='sent',sent_at=now() where destination_type='channel';update spot_notification_deliveries set claimed_at=now()-interval '6 minutes' where destination_type='user';");
 assert.equal(await claim('channel','existing'),'sent');assert.equal(await claim('user','additional'),'uncertain');assert.equal(await claim('user','additional'),'uncertain');
 await assert.rejects(claim('invalid','x'));await assert.rejects(claim('user',''));
 await assert.rejects(db.exec("insert into spot_notification_recipients values('user',array['payroll'],true,now())"));
 for(const role of ['anon','authenticated']){
 assert.equal((await db.query("select has_table_privilege($1,'spot_notification_recipients','select') as allowed",[role])).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege($1,'claim_spot_notification_delivery(text,text,text)','execute') as allowed",[role])).rows[0].allowed,false);
 }
 assert.equal((await db.query("select has_function_privilege('service_role','claim_spot_notification_delivery(text,text,text)','execute') as allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
