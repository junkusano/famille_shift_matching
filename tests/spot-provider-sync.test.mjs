import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ts=require('typescript');
function load(path) {const c=vm.createContext({exports:{},Date,URL,Map});vm.runInContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;}
const {desiredAction,staffAssigned,canRecruit}=load('../src/lib/spot-sync/policy.ts');
const roles=new Map([['m','manager'],['a','admin'],['w','staff']]);
const shift={shift_start_date:'2026-09-10',shift_start_time:'10:00:00',staff_01_user_id:'m'};
const now=Date.parse('2026-09-10T08:00:00+09:00');
const base={provider:'sharefull',status:'募集中',applications:[],shift,assigned:false,manualStop:false,now};
test('マネジャーが非同行担当に残る限り未確定。同行のみなら確定',()=>{
 assert.equal(staffAssigned({staff_01_user_id:'w',staff_02_user_id:'m',staff_02_attend_flg:false},roles),false);
 assert.equal(staffAssigned({staff_01_user_id:'w',staff_02_user_id:'m',staff_02_attend_flg:true},roles),true);
 assert.equal(staffAssigned({staff_01_user_id:'w',staff_03_user_id:'m',staff_03_attend_flg:false},roles),false);
 assert.equal(staffAssigned({staff_01_user_id:'w',staff_03_user_id:'m',staff_03_attend_flg:true},roles),true);
 assert.equal(staffAssigned({staff_01_user_id:'m'},roles),false);
 assert.equal(staffAssigned({staff_01_user_id:'a'},roles),false);
 assert.equal(staffAssigned({staff_01_user_id:'-'},roles),false);
});
test('応募ありで他媒体を停止する。応募元はキャンセルしない',()=>{
 assert.equal(desiredAction({...base,applications:[{provider:'taimee',state:'applied'}]}),'close');
 assert.equal(desiredAction({...base,provider:'taimee',applications:[{provider:'sharefull',state:'applied'}]}),'close');
 assert.equal(desiredAction({...base,applications:[{provider:'sharefull',state:'applied'}]}),'hold');
 assert.equal(desiredAction({...base,applications:[{provider:'jmty',state:'applied'}]}),'close');
});
test('再募集は2時間以上。2時間未満でも停止は実行',()=>{
 assert.equal(canRecruit(shift,now),true);assert.equal(canRecruit(shift,now+1),false);
 assert.equal(desiredAction({...base,applications:[{provider:'taimee',state:'cancelled'}]}),'open');
 assert.equal(desiredAction({...base,now:now+1}),'hold');
 assert.equal(desiredAction({...base,now:now+1,applications:[{provider:'taimee',state:'confirmed'}]}),'close');
 assert.equal(desiredAction({...base,assigned:true}),'close');
 assert.equal(desiredAction({...base,manualStop:true}),'close');
});

// SQLは本番DBではなく一時的なPostgreSQLで実行。
test('SQL: 重複・逆順メール・他媒体キャンセル・同時応募・PAD上書き',async()=>{
 const {PGlite}=await import('../tmp/spot-sync-tools/node_modules/@electric-sql/pglite/dist/index.js');
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table spot_offer_request_table(id uuid primary key, status text, applicant_name text,applicant_sex text,applicant_control_url text,updated_at timestamptz,created_at timestamptz,sharefull_job_id text,sharefull_status text);
 create table rpa_runner_jobs(id uuid primary key,claimed_runner_id text,status text,job_type text,payload jsonb,result jsonb,completed_at timestamptz);
 create table rpa_command_requests(request_details jsonb);
 create table dummy_shift(id uuid); create view shift_self_coordinate_card_view2 as select d.id,s.applicant_control_url from dummy_shift d left join spot_offer_request_table s on d.id=s.id;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/202609080900_spot_provider_sync.sql',import.meta.url),'utf8'));
 const id='00000000-0000-4000-8000-000000000001';
 await db.query("insert into spot_offer_request_table(id,status) values($1,'募集中')",[id]);
 const event=async(provider,key,state,time,eventId)=>db.query('select record_spot_offer_application($1,$2,$3,$4,$5,$6,$7,null,null)',[id,provider,key,eventId,state,time,provider+'さん']);
 const row=async()=>(await db.query('select * from spot_offer_request_table where id=$1',[id])).rows[0];
 await event('sharefull','s1','applied','2026-09-08T01:00Z','s1-apply');
 assert.equal((await row()).status,'確定');assert.equal((await row()).application_state,'applied');
 await event('taimee','legacy','cancelled','2026-09-08T01:01Z','t1-cancel');
 assert.equal((await row()).applicant_source,'sharefull');
 await db.query("update spot_offer_request_table set status='募集なし',applicant_name='' where id=$1",[id]);
 assert.equal((await row()).status,'確定');assert.equal((await row()).applicant_name,'sharefullさん');
 await event('taimee','legacy','confirmed','2026-09-08T01:02Z','t2-apply');
 assert.equal((await row()).application_conflict,true);
 await event('sharefull','s1','cancelled','2026-09-08T01:03Z','s1-cancel');
 assert.equal((await row()).applicant_source,'taimee');
 await event('sharefull','s1','applied','2026-09-08T01:00Z','s1-old');
 assert.equal((await row()).applicant_source,'taimee');
 await event('taimee','legacy','cancelled','2026-09-08T01:04Z','t2-cancel');
 assert.equal((await row()).status,'募集中');
 const rev=(await row()).recruitment_revision;
 await event('taimee','legacy','cancelled','2026-09-08T01:04Z','t2-cancel');
 assert.equal((await row()).recruitment_revision,rev);
 await db.query("update spot_offer_request_table set recruitment_paused=true where id=$1",[id]);
 await event('sharefull','s2','applied','2026-09-08T02:00Z','s2-apply');
 await event('sharefull','s2','cancelled','2026-09-08T02:01Z','s2-cancel');
 assert.equal((await row()).status,'募集なし');
 const job='00000000-0000-4000-8000-000000000002';
 await db.query("update spot_offer_request_table set sharefull_job_id='123',sharefull_order_id='456',sharefull_status='published' where id=$1",[id]);
 await db.query("insert into rpa_runner_jobs(id,claimed_runner_id,status,job_type,payload) values($1,'runner','claimed','sharefull.close_spot_offer',$2)",[job,JSON.stringify({spot_offer_request_id:id,sharefull_job_id:'123',sharefull_order_id:'456'})]);
 const complete=result=>db.query("select complete_sharefull_sync_job($1,'runner',$2)",[job,JSON.stringify(result)]);
 await assert.rejects(complete({closed:true,sharefull_job_id:'999',sharefull_order_id:'456'}));
 assert.equal((await row()).sharefull_status,'published');
 assert.equal((await db.query('select status from rpa_runner_jobs where id=$1',[job])).rows[0].status,'claimed');
 await assert.rejects(complete({sharefull_job_id:'123',sharefull_order_id:'456'}));
 await complete({closed:true,sharefull_job_id:'123',sharefull_order_id:'456'});
 assert.equal((await row()).sharefull_status,'closed');
 assert.equal((await db.query('select status from rpa_runner_jobs where id=$1',[job])).rows[0].status,'completed');
 await complete({closed:true,sharefull_job_id:'123',sharefull_order_id:'456'});
 assert.equal((await db.query('select count(*)::int as n from spot_offer_publication_history')).rows[0].n,1);
 } finally {await db.close();}
});
