import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const time='2026-10-23T05:25:42Z';
function load(options={}){
 const rows={
  rpa_command_requests:[{id:'mail-close',status:options.commandStatus||'done',created_at:time,request_details:{created_from:'/api/rpa/sharefull/confirmed',spot_offer_request:{id:'request'},taimee_job_id:'56635633',sharefull_application_key:'application',sync_operation_key:'spot-sync:taimee:close:56635633:sharefull-confirmed:mail'}}],
  spot_offer_mail_receipts:[{provider:'sharefull',event_kind:'confirmed',event_id:'mail',occurred_at:time}],
  spot_offer_applications:[{request_id:'request',provider:'sharefull',state:options.applicationState||'confirmed',application_key:'application',occurred_at:options.applicationTime||time}],
 };
 const field=(row,key)=>key.split(/->>?/).reduce((v,k)=>v?.[k],row);
 const db={from:table=>{const filters=[];const b={select:()=>b,eq:(k,v)=>{filters.push(r=>field(r,k)===v);return b;},in:(k,v)=>{filters.push(r=>v.includes(field(r,k)));return b;},order:()=>b,limit:()=>b,then:(resolve,reject)=>Promise.resolve({data:rows[table].filter(r=>filters.every(f=>f(r))),error:options.error||null}).then(resolve,reject)};return b;}};
 const source=fs.readFileSync('src/lib/spot-sync/sharefullMailClose.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 const c=vm.createContext({exports:{},db,Date,Error});vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 return c.exports.findCurrentSharefullMailClose;
}
test('Cronは現在の確定と同じメール停止指示を完了後も再利用する',async()=>{
 for(const commandStatus of ['approved','running','done'])assert.equal(await load({commandStatus})('request','56635633'),'mail-close');
});
test('取消後・新しい確定・失敗済み指示・別Timee案件は再利用しない',async()=>{
 for(const options of [{applicationState:'cancelled'},{applicationTime:'2026-10-24T00:00:00Z'},{commandStatus:'failed'}])assert.equal(await load(options)('request','56635633'),null);
 assert.equal(await load()('request','different'),null);
});
test('照合DBの失敗を指示なしと誤認して新規停止を作らない',async()=>{
 await assert.rejects(load({error:new Error('database failed')})('request','56635633'),/database failed/);
});
test('既存停止指示の再利用時は実createCloseRequestがDBへ追加しない',async()=>{
 const calls=[];const c=vm.createContext({exports:{},process:{env:{}},console:{log(){}},
  createClient:()=>({from(){throw new Error('Unexpected database write');}}),
  findCurrentSharefullMailClose:async(...args)=>{calls.push(args);return 'mail-close';},
 });
 const source=fs.readFileSync('src/lib/spot_offer/spot_offer_sync_check.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 const result=await c.exports.createCloseRequest({id:'request',taimee_job_id:'56635633'},'other_application');
 assert.equal(result.close_request_id,'mail-close');assert.equal(calls.length,1);
});
