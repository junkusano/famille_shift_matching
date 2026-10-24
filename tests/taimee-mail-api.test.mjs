import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash,timingSafeEqual} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(options={}) {
 const calls=[],receipts=new Map();
 const target={id:'request-1',taimee_job_id:'99900001',template_title:'介護スタッフ@12345678@',shift_start_date:'2026-11-01',shift_start_time:'16:35:00',kaipoke_cs_id:'scope',...options.target};
 const db={from:table=>{let update=null,insert=null;const b={select:()=>b,eq:()=>b,limit:()=>b,
  upsert:value=>{insert=value;return b;},update:value=>{update=value;return b;},single:()=>b,
  then:(resolve,reject)=>{calls.push({table,update,insert});let data;
   if(table==='spot_offer_mail_receipts') {if(insert&&!receipts.has(insert.event_id))receipts.set(insert.event_id,{...insert,status:'received'});if(update)Object.assign(receipts.get('mail-1')||{},update);data=receipts.get('mail-1');}
   else data=table==='spot_offer_request_table'?(options.noTarget?[]:[target]):(options.apps||[]);
   return Promise.resolve({data,error:update&&options.finishError?{code:'fail'}:null}).then(resolve,reject);}};return b;},
  rpc:async(name,args)=>{calls.push({name,args});return name==='record_spot_offer_application'?{data:{ok:true},error:null}:
   {data:options.result||{outcome:args.p_state==='cancelled'?'cancelled':'queued',close_job_id:'job-1',republication:'reconcile_pending'},error:options.syncError||null};}};
 class FixedDate extends Date {static now(){return Date.parse('2026-10-24T12:00:00Z');}};
 const c=vm.createContext({exports:{},createHash,timingSafeEqual,Buffer,Date:FixedDate,Error,console:{info:()=>{},warn:()=>{}},
  process:{env:{TAIMEE_CONFIRMATION_GAS_TOKEN:'opaque',SPOT_PROVIDER_SYNC_ENABLED:'true'}},db,
  NextResponse:{json:(body,o={})=>({body,status:o.status||200})},isSharefullSyncClient:()=>!options.outOfScope,sharefullRpaMode:()=> 'production',sharefullMailWorkFinished:()=>!!options.expired,
  notifySharefullApplication:async args=>{calls.push({notify:args});return {sent:!options.notificationFail};}});
 const source=fs.readFileSync('src/lib/spot-sync/taimeeMail.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 const mail={event_id:'mail-1',taimee_job_id:'99900001',template_title:'介護スタッフ',shift_start_date:'2026-11-01',shift_start_time:'16:35',applicant_name:'候補者 A',occurred_at:'2026-10-24T01:00Z'};
 return {calls,receipts,run:(state='confirmed',patch={},token='opaque')=>c.exports.handleTaimeeMail({headers:{get:()=>`Bearer ${token}`},json:async()=>({...mail,...patch})},state)};
}
test('確定はタグ差を正規化して照合し、停止登録と通知後だけ厳密ACKを返す',async()=>{const h=load(),r=await h.run();assert.equal(r.status,200);assert.equal(r.body.close_job_id,'job-1');assert.equal(r.body.recorded,true);assert.equal(h.receipts.get('mail-1').status,'completed');assert.ok(!h.calls.find(c=>c.notify).notify.text.includes('候補者'));});
test('同じメールの再送は停止・通知を重ねず完了ACKを返す',async()=>{const h=load();await h.run();const count=h.calls.filter(c=>c.name||c.notify).length;assert.equal((await h.run()).body.close_job_id,'job-1');assert.equal(h.calls.filter(c=>c.name||c.notify).length,count);});
test('取消を人物キーで記録し、再掲載判定を既存同期へ委ねる',async()=>{const h=load(),r=await h.run('cancelled');assert.equal(r.body.outcome,'cancelled');assert.equal(r.body.republication,'reconcile_pending');assert.equal(h.calls.find(c=>c.name==='record_spot_offer_application').args.p_state,'cancelled');});
test('別人のキーを指定してもサーバーの人物キーを上書きできない',async()=>{const h=load();await h.run('cancelled',{application_key:'another-worker'});assert.notEqual(h.calls.find(c=>c.name==='record_spot_offer_application').args.p_application_key,'another-worker');});
test('匿名旧レコードや同名の複数応募は推測で取消しない',async()=>{for(const apps of [[{applicant_name:null,state:'confirmed'}],[{applicant_name:'候補者A'},{applicant_name:'候補者 A'}]]){const h=load({apps});assert.equal((await h.run('cancelled')).status,409);assert.equal(h.receipts.get('mail-1').status,'retry');assert.ok(!h.calls.some(c=>c.name));}});
test('旧応募の一意な名前が一致すれば旧キーを継承する',async()=>{const h=load({apps:[{applicant_name:'候補者 A',application_key:'legacy'}]});await h.run('cancelled');assert.equal(h.calls.find(c=>c.name==='record_spot_offer_application').args.p_application_key,'legacy');});
test('案件不明・照合不一致・通知失敗・停止ID欠落はACKせず再試行する',async()=>{for(const options of [{noTarget:true},{target:{template_title:'別案件'}},{notificationFail:true},{result:{outcome:'queued'}}]){const h=load(options),r=await h.run();assert.equal(r.body.ok,false);assert.equal(h.receipts.get('mail-1').status,'retry');}});
test('古いメールと勤務終了後は停止と通知を増やさない',async()=>{for(const options of [{result:{outcome:'stale'}},{expired:true}]){const h=load(options),r=await h.run();assert.equal(r.body.ok,true);assert.ok(!h.calls.some(c=>c.notify));}});
test('同じメールIDの内容衝突は元の受領を上書きしない',async()=>{const h=load();await h.run();assert.equal((await h.run('cancelled')).body.code,'MAIL_EVENT_ID_COLLISION');assert.equal(h.receipts.get('mail-1').outcome,'queued');});
test('認証失敗・名前不明・未来の発生日時は業務を書き換えない',async()=>{for(const [patch,token] of [[{},'wrong'],[{applicant_name:''},'opaque'],[{occurred_at:'2099-01-01'},'opaque']]){const h=load();assert.ok((await h.run('confirmed',patch,token)).status>=400);assert.equal(h.calls.length,0);}});

