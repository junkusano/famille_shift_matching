import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function harness() {
 const rows=new Map();
 const db={from:()=>{let operation,values,eventId;
  const execute=()=>{if(operation==='upsert'){if(!rows.has(values.event_id))rows.set(values.event_id,{...values,status:'received',close_request_id:null});return {data:null,error:null};}
   const row=rows.get(eventId);if(operation==='update'&&row)Object.assign(row,values);return {data:row?{...row}:null,error:null};};
  const b={upsert:v=>{operation='upsert';values=v;return b;},select:()=>b,eq:(k,v)=>{if(k==='event_id')eventId=v;return b;},update:v=>{operation='update';values=v;return b;},single:async()=>{const r=execute();if(!r.data)r.error=Error('row missing');return r;},then:(resolve,reject)=>Promise.resolve(execute()).then(resolve,reject)};return b;}};
 const context=vm.createContext({exports:{},Date,Error,console:{info:()=>{}},require:name=>name==='node:crypto'?require(name):{supabaseAdmin:db}});
 vm.runInContext(ts.transpileModule(fs.readFileSync('src/lib/spot-sync/sharefullMailReceipt.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {...context.exports,rows};
}
const mail={eventId:'mail1',kind:'confirmed',jobId:'',orderId:'1234',occurredAt:'2026-10-22T00:00:00Z',applicationKey:'1234::candidate',applicantName:'candidate',cancellationReason:''};
test('同一メールは受領を一件に保ち、再送で完了状態を上書きしない',async()=>{
 const h=harness();await h.receiveSharefullMail(mail);await h.finishSharefullMail('mail1',{status:'completed',close_request_id:'close1'});const r=await h.receiveSharefullMail(mail);assert.equal(h.rows.size,1);assert.equal(r.status,'completed');assert.equal(r.close_request_id,'close1');
});
test('同一ID・異なる内容の再送を拒み、元の受領を維持する',async()=>{
 const h=harness();await h.receiveSharefullMail(mail);await assert.rejects(h.receiveSharefullMail({...mail,orderId:'other'}),/MAIL_EVENT_ID_COLLISION/);assert.equal(h.rows.get('mail1').order_id,'1234');
});
test('旧GASから新版への切替でfallbackキーだけが変わっても同じ受領を利用する',async()=>{
 const h=harness();const old={...mail,jobId:'5678',applicationKey:'5678::candidate'};
 await h.receiveSharefullMail(old);await h.finishSharefullMail('mail1',{status:'completed',close_request_id:'close1'});
 const r=await h.receiveSharefullMail({...old,applicationKey:'1234::candidate'});assert.equal(r.status,'completed');assert.equal(h.rows.size,1);
 await assert.rejects(h.receiveSharefullMail({...old,applicationKey:'custom-identity'}),/MAIL_EVENT_ID_COLLISION/);
});
test('受領行が存在しない完了更新を成功扱いしない',async()=>{
 const h=harness();await assert.rejects(h.finishSharefullMail('missing',{status:'completed'}),/row missing/);
});
test('勤務終了と日付を跨ぐ終了時刻を日本時間で判定する',()=>{
 const h=harness();assert.equal(h.sharefullMailWorkFinished({shift_start_date:'2026-10-22',shift_start_time:'23:00',shift_end_time:'01:00'},Date.parse('2026-10-22T15:30:00Z')),false);assert.equal(h.sharefullMailWorkFinished({shift_start_date:'2026-10-22',shift_start_time:'23:00',shift_end_time:'01:00'},Date.parse('2026-10-22T16:00:00Z')),true);
});
