import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url), ts=require('typescript');
function fixture(options={}) {
 const request={id:'request',shift_id:1,kaipoke_cs_id:'scope',status:'募集中',taimee_job_id:'current',sharefull_job_id:'sharefull',sharefull_order_id:'order',sharefull_status:'published',recruitment_revision:2,...options.request};
 const command=(id,status,created_at,job='current')=>({id,status,created_at,request_details:{shift_id:1,reason:'other_application',command:'close_job',taimee_job_id:job}});
 const rows={spot_offer_request_table:[request],shift:[{shift_id:1,shift_start_date:'2099-10-28',shift_start_time:'16:35:00',...options.shift}],user_entry_united_view_single:[],spot_offer_applications:options.applications??[{request_id:'request',provider:'sharefull',state:'cancelled'}],rpa_command_requests:options.commands??[command('success','done','2026-10-23T05:30Z'),command('duplicate','failed','2026-10-23T05:33Z')],rpa_runner_jobs:[]};
 const opens=[],writes=[];
 const field=(r,k)=>k.split(/->>?/).reduce((v,p)=>v?.[p],r);
 const db={from(table){let filters=[],sort,maximum=Infinity,values;const q={select:()=>q,eq(k,v){filters.push(r=>String(field(r,k))===String(v));return q;},in(k,v){filters.push(r=>v.includes(field(r,k)));return q;},gte:()=>q,order(k,o){sort=[k,o];return q;},range:()=>q,limit(n){maximum=n;return q;},update(v){values=v;return q;},then(resolve,reject){return Promise.resolve().then(()=>{if(options.errorTable===table) return {data:null,error:{message:'database unavailable'}};let result=rows[table].filter(r=>filters.every(f=>f(r)));if(sort)result.sort((a,b)=>String(field(a,sort[0])).localeCompare(String(field(b,sort[0])))*(sort[1]?.ascending===false?-1:1));result=result.slice(0,maximum);if(values){writes.push({table,values,ids:result.map(r=>r.id)});for(const r of result)Object.assign(r,values);}return {data:result,error:null};}).then(resolve,reject);}};return q;}};
 const c=vm.createContext({exports:{},db,process:{env:{SPOT_PROVIDER_SYNC_ENABLED:'true'}},Date,Map,Error,
  sharefullRpaMode:()=>options.testMode?'test':'production',sharefullRequestTableName:()=> 'spot_offer_request_table',sharefullApplicationTableName:()=> 'spot_offer_applications',isSharefullSyncClient:()=>true,
  createCloseRequest:async()=>{},createOpenRequest:async(shift,opts,meta)=>{opens.push(meta);rows.rpa_command_requests.push({id:'open',status:'approved',request_details:{sync_operation_key:`spot-sync:taimee:open:${meta.sourceCloseRequestId}`}});},
 });
 for(const name of ['policy','reconcile']) {const source=readFileSync(new URL(`../src/lib/spot-sync/${name}.ts`,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);}
 return {run:c.exports.reconcileSpotProviders,opens,writes,request,command,rows};
}
test('取消後は停止成功の後に失敗があっても同じ求人の停止成功から再掲載する',async()=>{
 const f=fixture();assert.equal((await f.run()).errors.length,0);assert.equal(f.opens.length,1);assert.equal(f.opens[0].sourceCloseRequestId,'success');
 await f.run();assert.equal(f.opens.length,1);assert.equal(f.request.sharefull_job_id,'sharefull');
});
test('別求人の過去停止・未完了停止からは再掲載しない',async()=>{
 for(const status of ['failed','running','approved','cancelled']) {const f=fixture();f.rows.rpa_command_requests=[f.command('other','done','2026-10-23T05:20Z','old'),f.command('unfinished',status,'2026-10-23T05:30Z')];await f.run();assert.equal(f.opens.length,0,status);}
});
test('他応募・手動停止・開始2時間未満・テストモードでは再掲載しない',async()=>{
 for(const options of [{applications:[{request_id:'request',provider:'taimee',state:'confirmed'}]},{applications:[{request_id:'request',provider:'sharefull',state:'confirmed'}]},{request:{recruitment_paused:true}},{request:{status:'募集なし'}},{shift:{shift_start_date:'2020-01-01'}},{testMode:true}]){const f=fixture(options);assert.equal((await f.run()).errors.length,0);assert.equal(f.opens.length,0);}
});
test('成功履歴があっても同じ求人の停止が実行中なら再掲載を待つ',async()=>{const f=fixture();f.rows.rpa_command_requests.push(f.command('running','running','2026-10-23T05:40Z'));await f.run();assert.equal(f.opens.length,0);});
test('終了したSharefullだけIDを開放し、既存公開求人は重複作成しない',async()=>{
 const f=fixture({request:{sharefull_status:'closed'}});await f.run();assert.equal(f.request.sharefull_job_id,null);assert.equal(f.request.sharefull_order_id,null);assert.equal(f.request.sharefull_status,'ready_for_offer');
 const active=fixture({applications:[{request_id:'request',provider:'sharefull',state:'confirmed'}],request:{status:'確定',sharefull_status:'closed'}});await active.run();assert.equal(active.request.sharefull_job_id,'sharefull');
});
test('履歴照会失敗を再掲載可能と誤認しない',async()=>{const f=fixture({errorTable:'rpa_command_requests'});const r=await f.run();assert.equal(r.errors.length,1);assert.equal(f.opens.length,0);});
