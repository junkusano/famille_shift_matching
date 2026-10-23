import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const input={topic:'sharefull_application',key:'mail-1',channelId:'existing-channel',text:'confirmation',accessToken:'opaque'};
function load(options={}) {
 const rows=new Map(),calls=[],recipients=options.recipients??[{lw_user_id:'additional-user'}];
 let reject=options.rejectUser,failSave=options.failSave;
 const db={async rpc(name,a){assert.equal(name,'claim_spot_notification_delivery');const k=[a.p_key,a.p_type,a.p_destination].join('|');const row=rows.get(k);if(row?.status==='sent')return {data:'sent'};if(row&&row.status!=='pending')return {data:row.status==='uncertain'?'uncertain':'busy'};rows.set(k,{status:'sending'});return {data:'claimed'};},from(table){const filters={};let values;const q={select:()=>q,eq(k,v){filters[k]=v;return q;},contains:()=>q,update(v){values=v;return q;},async maybeSingle(){if(failSave){failSave=false;return {error:new Error('write failed')};}const k=[filters.notification_key,filters.destination_type,filters.destination_id].join('|');Object.assign(rows.get(k),values);return {data:{status:values.status},error:null};},then(resolve,reject){if(table==='spot_notification_recipients')return Promise.resolve({data:recipients,error:options.recipientLookupFails?new Error('lookup failed'):null}).then(resolve,reject);const k=[filters.notification_key,filters.destination_type,filters.destination_id].join('|');Object.assign(rows.get(k),values);return Promise.resolve({error:null}).then(resolve,reject);}};return q;}};
 const channel=async(id)=>{calls.push(['channel',id]);};
 const user=async(id)=>{calls.push(['user',id]);if(reject===id)throw new Error(options.network?'network disconnected':'LINE WORKS message send failed: rejected');};
 const c=vm.createContext({exports:{},process:{env:options.env??{}},supabaseAdmin:db,sendLWBotMessage:channel,Date,Set,Error,AbortSignal,fetch:options.fetch??(async()=>({ok:true,status:201}))});
 const source=fs.readFileSync('src/lib/spot-sync/sendSpotNotification.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);
 return {send:(x=input)=>c.exports.sendSpotNotification(x,options.realUserTransport?{sendChannel:channel}:{sendChannel:channel,sendUser:user}),calls,rows,recover(){reject=null;}};
}
test('既存トークと追加個別受信者へ各1回送り、同一イベントを再送しない',async()=>{const f=load();await f.send();await f.send();assert.deepEqual(f.calls,[['channel','existing-channel'],['user','additional-user']]);assert.ok([...f.rows.values()].every(r=>r.status==='sent'&&!('text'in r)));});
test('個別送信の拒否後は個別だけ再試行し、成功した共通トークを重複送信しない',async()=>{const f=load({rejectUser:'additional-user'});await assert.rejects(f.send(),/COPY_PENDING/);f.recover();await f.send();assert.equal(f.calls.filter(c=>c[0]==='channel').length,1);assert.equal(f.calls.filter(c=>c[0]==='user').length,2);});
test('一人の失敗で他の個別受信者を止めず、成功済み宛先は再送しない',async()=>{const f=load({rejectUser:'first',recipients:[{lw_user_id:'first'},{lw_user_id:'second'},{lw_user_id:'second'}]});await assert.rejects(f.send());assert.equal(f.calls.filter(c=>c[1]==='second').length,1);f.recover();await f.send();assert.equal(f.calls.filter(c=>c[1]==='second').length,1);});
test('通信断で受理結果不明の場合は個別を自動再送しない',async()=>{const f=load({rejectUser:'additional-user',network:true});await assert.rejects(f.send());f.recover();await assert.rejects(f.send());assert.equal(f.calls.filter(c=>c[0]==='user').length,1);assert.ok([...f.rows.values()].some(r=>r.status==='uncertain'));});
test('送信後の記録失敗や同時実行でも既存トークを重複送信しない',async()=>{const f=load({failSave:true});await assert.rejects(f.send(),/RESULT_SAVE_FAILED/);await assert.rejects(f.send(),/IN_PROGRESS/);assert.equal(f.calls.length,1);const g=load();await Promise.allSettled([g.send(),g.send()]);assert.equal(g.calls.filter(c=>c[0]==='channel').length,1);});
test('テストモードの通知は既存宛先だけで、本番個別受信者を参照しない',async()=>{const f=load();await f.send({...input,isTest:true});assert.deepEqual(f.calls,[['channel','existing-channel']]);assert.equal(f.rows.size,0);});
test('環境全体がテストモードなら、本番イベント形式でも個別送信をしない',async()=>{const f=load({env:{SHAREFULL_RPA_MODE:'test'}});await f.send();assert.equal(f.rows.size,0);assert.equal(f.calls.length,1);});
test('実個別送信はBotユーザーAPIを使い、IDをエンコードしHTTP拒否だけを再試行する',async()=>{let outgoing;const f=load({realUserTransport:true,recipients:[{lw_user_id:'user@example.test'}],fetch:async(url,args)=>{outgoing={url,args};return {ok:false,status:403};}});await assert.rejects(f.send());assert.match(outgoing.url,/\/bots\/6807751\/users\/user%40example.test\/messages$/);assert.equal(JSON.parse(outgoing.args.body).content.text,'confirmation');assert.ok([...f.rows.values()].some(r=>r.status==='pending'));});
test('個別受信者の検索に失敗しても既存トークの送信済みを保持する',async()=>{const f=load({recipientLookupFails:true});await assert.rejects(f.send(),/LOOKUP_FAILED/);await assert.rejects(f.send());assert.equal(f.calls.length,1);});

