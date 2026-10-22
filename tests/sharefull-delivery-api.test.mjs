import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(kind,options={}) {
 const calls=[],finishes=[];
 const target={id:'request-1',sharefull_order_id:'1234',taimee_job_id:'5678',...options.target};
 const context=vm.createContext({exports:{},Buffer,Error,Date,console:{error:()=>{}},process:{env:{SHAREFULL_CONFIRMATION_GAS_TOKEN:'test-token'}},
 timingSafeEqual:(a,b)=>a.equals(b),NextResponse:{json:(body,o={})=>({body,status:o.status??200})},
 receiveSharefullMail:async m=>{calls.push(['receive',m]);if(options.receiveError)throw options.receiveError;return {status:options.receiptStatus??'received',close_request_id:'close-1'};},
 finishSharefullMail:async(id,u)=>{calls.push(['finish',u]);finishes.push(u);if(options.finishError)throw options.finishError;},
 sharefullMailWorkFinished:()=>!!options.expired,
 notifySharefullApplication:async()=>{calls.push(['notify']);return {sent:true};},
 createCloseRequest:async(...args)=>{calls.push(['close',...args]);if(options.closeError)throw options.closeError;return options.closeResult??{outcome:'queued',close_request_id:'close-1'};},
 supabaseAdmin:{from:table=>{calls.push(['select',table]);const filters={};const b={select:()=>b,limit:()=>b,eq:(k,v)=>{filters[k]=v;return b;},in:()=>b,update:()=>b,then:(resolve,reject)=>Promise.resolve({data:table==='spot_offer_request_table'?(options.noTarget?[]:[target]):(options.applications??[]).filter(a=>['application_key','applicant_name'].every(k=>filters[k]===undefined||a[k]===filters[k])),error:null}).then(resolve,reject)};return b;},
  rpc:async(name,args)=>{calls.push(['record',name,args]);return {data:options.recordResult??{ok:true},error:null};}}
 });
 const source=fs.readFileSync(`src/app/api/rpa/sharefull/${kind}/route.ts`,'utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const body={sharefull_order_id:'1234',event_id:'mail-1',application_key:'1234::candidate',applicant_name:'candidate',occurred_at:'2026-10-22T01:00:00Z'};
 return {calls,finishes,run:(patch={},token='test-token')=>context.exports.POST({headers:{get:()=>`Bearer ${token}`},json:async()=>({...body,...patch})})};
}
test('認証エラーではメール受領・応募・停止指示を書かない',async()=>{
 const h=load('confirmed');const r=await h.run({},'wrong');assert.equal(r.status,401);assert.equal(h.calls.length,0);
});
test('案件が見つからなくても受領を先に永続化し、再試行状態を残す',async()=>{
 const h=load('confirmed',{noTarget:true});const r=await h.run();assert.equal(h.calls[0][0],'receive');assert.equal(r.status,404);assert.equal(h.finishes.at(-1).error_code,'REQUEST_NOT_FOUND');assert.equal(r.body.recorded,true);
});
test('タイミーIDが未紐付けなら受領と応募状態を記録し、成功ACKを返さない',async()=>{
 const h=load('confirmed',{target:{taimee_job_id:''},closeResult:{outcome:'target_missing'}});const r=await h.run();assert.equal(r.status,409);assert.equal(r.body.ok,false);assert.equal(r.body.code,'TAIMEE_JOB_ID_MISSING');assert.ok(h.calls.some(c=>c[0]==='record'));assert.equal(h.finishes.at(-1).status,'retry');
});
test('停止指示IDが実在する結果のときだけ同一メールの成功ACKを返す',async()=>{
 const h=load('confirmed');const r=await h.run();assert.equal(r.status,200);assert.equal(r.body.close_request_id,'close-1');assert.equal(r.body.event_id,'mail-1');assert.equal(r.body.recorded,true);assert.equal(h.finishes.at(-1).status,'completed');assert.equal(h.calls.find(c=>c[0]==='close')[3].sharefullConfirmation.eventId,'mail-1');
});
test('停止指示IDなし・DB例外は成功にせず再試行に残す',async()=>{
 for(const o of [{closeResult:{outcome:'queued'}},{closeError:new Error('database')}]){const h=load('confirmed',o);const r=await h.run();assert.equal(r.body.ok,false);assert.equal(h.finishes.at(-1).status,'retry');}
});
test('キャンセル後の旧確定再送では停止指示の原子的判定結果を受け入れる',async()=>{
 const h=load('confirmed',{recordResult:{duplicate:true},closeResult:{outcome:'stale'}});const r=await h.run();assert.equal(r.body.outcome,'stale');assert.equal(r.body.recorded,true);assert.equal(h.finishes.at(-1).status,'ignored');
});
test('完了済みメール再送は記録や停止指示を重ねない',async()=>{
 const h=load('confirmed',{receiptStatus:'completed'});const r=await h.run();assert.equal(r.body.outcome,'already_processed');assert.equal(h.calls.length,1);
});
test('同じメールIDの別内容は409とし、元受領を上書きしない',async()=>{
 const h=load('confirmed',{receiveError:new Error('MAIL_EVENT_ID_COLLISION')});const r=await h.run();assert.equal(r.status,409);assert.equal(h.finishes.length,0);
});
test('確定を取り逃しても応募キーが明確なキャンセルを記録できる',async()=>{
 const h=load('cancelled');const r=await h.run();assert.equal(r.status,200);const call=h.calls.find(c=>c[0]==='record');assert.equal(call[2].p_state,'cancelled');assert.equal(call[2].p_application_key,'1234::candidate');assert.equal(r.body.outcome,'cancelled');assert.equal(h.finishes.at(-1).status,'completed');
});
test('応募を特定できないキャンセルは受領を残して409にする',async()=>{
 const h=load('cancelled');const r=await h.run({application_key:'',applicant_name:''});assert.equal(r.status,409);assert.equal(h.finishes.at(-1).error_code,'APPLICATION_NOT_IDENTIFIABLE');assert.ok(!h.calls.some(c=>c[0]==='record'));
});
test('勤務終了後の追いつき処理は受領のみ記録し、募集状態・停止・通知を変更しない',async()=>{
 for(const kind of ['confirmed','cancelled']){const h=load(kind,{expired:true});const r=await h.run();assert.equal(r.body.outcome,'work_finished');assert.ok(!h.calls.some(c=>['record','close','notify'].includes(c[0])));assert.equal(h.finishes.at(-1).status,'ignored');}
});
test('受領の完了記録に失敗した場合も成功ACKを返さない',async()=>{
 const h=load('confirmed',{finishError:new Error('write failed')});const r=await h.run();assert.equal(r.status,500);assert.equal(r.body.ok,false);
});
test('旧版の求人IDfallbackキーを同一案件の一意な応募から継承する',async()=>{
 for(const kind of ['confirmed','cancelled']){const h=load(kind,{applications:[{application_key:'job-legacy::candidate',applicant_name:'candidate'}]});const r=await h.run();assert.equal(r.status,200);assert.equal(h.calls.find(c=>c[0]==='record')[2].p_application_key,'job-legacy::candidate');}
});
test('同名の応募が複数ある場合に推測で選ばない',async()=>{
 for(const kind of ['confirmed','cancelled']){const h=load(kind,{applications:[{application_key:'old1::candidate',applicant_name:'candidate'},{application_key:'old2::candidate',applicant_name:'candidate'}]});const r=await h.run();assert.equal(r.status,409);assert.ok(!h.calls.some(c=>c[0]==='record'));}
});
