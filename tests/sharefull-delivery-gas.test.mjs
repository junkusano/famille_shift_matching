import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const path='scripts/gas/sharefull-confirmation-taimee-close.gs';
const source=process.env.GAS_TEST_REF ? execFileSync('git',['show',`${process.env.GAS_TEST_REF}:${path}`],{encoding:'utf8'}) : fs.readFileSync(path,'utf8');
const ack='SHAREFULL_CONFIRMATION_ACK_',pending='SHAREFULL_CONFIRMATION_PENDING_';
function mail(id,{cancel=false,date='2026-10-22T01:00:00Z',body,from='system@sharefull.com'}={}) {
 return {getId:()=>id,getDate:()=>new Date(date),getFrom:()=>from,
  getSubject:()=>cancel?'【応募キャンセル】':'【候補者が決定しました】',
  getPlainBody:()=>body??`${cancel?'キャンセルした応募者':'候補者'}\n候補者A\nhttps://client.sharefull.com/orders/1234`};
}
function harness(messages,{properties={},response,searchMessages=messages,labelled=[]}={}) {
 const props=new Map(Object.entries({MYFAMILLE_API_BASE_URL:'https://myfamille.shi-on.net',SHAREFULL_CONFIRMATION_GAS_TOKEN:'secret-test-token',SHAREFULL_CONFIRMATION_GMAIL_QUERY:'from:system@sharefull.com newer_than:14d',SHAREFULL_CONFIRMATION_FROM_EMAIL:'system@sharefull.com',SPOT_OFFER_CONFIRMATION_ACTIVATED_AT:'2026-10-01T00:00:00Z',...properties}));
 const calls=[],logs=[],labels=[],queries=[];
 const threads=searchMessages.map(m=>({getMessages:()=>[m],addLabel:()=>labels.push(m.getId())}));
 const propertiesApi={getProperty:k=>props.get(k)??null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
 const context=vm.createContext({console:{log:x=>logs.push(x),warn:x=>logs.push(x)},Date,JSON,
  PropertiesService:{getScriptProperties:()=>propertiesApi},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  GmailApp:{getUserLabelByName:()=>({getName:()=> 'MYFAMILLE_SHAREFULL_CONFIRMATION_PROCESSED'}),
    search:(q,start,size)=>{queries.push(q);let matches=q.includes('-label:')?threads.filter(t=>!labelled.includes(t.getMessages()[0].getId())&&!labels.includes(t.getMessages()[0].getId())):threads;if(q.includes('subject:confirmed'))matches=matches.filter(t=>t.getMessages()[0].getSubject().includes('候補者が決定'));return matches.slice(start,start+size);},
    getMessageById:id=>{const m=messages.find(m=>m.getId()===id);if(!m)throw Error('missing');return m;}},
  UrlFetchApp:{fetch:(url,options)=>{const event=JSON.parse(options.payload);calls.push({url,event});const r=response?.(event,calls.length)??{status:200,body:{ok:true,recorded:true,event_id:event.event_id,outcome:event.state==='cancelled'?'cancelled':'queued',close_request_id:'close-id'}};return {getResponseCode:()=>r.status,getContentText:()=>JSON.stringify(r.body)};}}
 });
 vm.runInContext(source,context);
 return {context,props,calls,logs,labels,queries,run:()=>context.processSharefullConfirmationsForTaimeeCloseLocked_()};
}
test('ラベルが付いた旧誤処理メールもAPIのACKがなければ送信する',()=>{
 const h=harness([mail('mail1')],{labelled:['mail1']});h.run();assert.equal(h.calls.length,1);assert.ok(h.props.has(ack+'mail1'));assert.ok(h.queries.every(q=>!q.includes('-label:')));
});
test('受領確認のない200/okと別メールIDのACKは処理済みにしない',()=>{
 for(const body of [{ok:true},{ok:true,recorded:true,event_id:'other',outcome:'queued',close_request_id:'id'},{ok:true,recorded:true,event_id:'mail1',outcome:'queued'}]) {
  const h=harness([mail('mail1')],{response:()=>({status:200,body})});assert.throws(h.run);assert.ok(h.props.has(pending+'mail1'));assert.ok(!h.props.has(ack+'mail1'));assert.equal(h.labels.length,0);
 }
});
test('通信応答が失われても同じメールIDを再送してACK後にだけpendingを消す',()=>{
 let lose=true;const h=harness([mail('mail1')],{response:event=>{if(lose)throw Error('network secret-test-token');return {status:200,body:{ok:true,recorded:true,event_id:event.event_id,outcome:'already_processed'}};}});
 assert.throws(h.run);assert.ok(h.props.has(pending+'mail1'));lose=false;h.run();assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.event.event_id==='mail1'));assert.ok(!h.props.has(pending+'mail1'));assert.ok(!h.logs.join('').includes('secret-test-token'));
});
test('検索期間から外れた失敗メールを保存済みIDで再取得する',()=>{
 const h=harness([mail('old')],{searchMessages:[],properties:{[pending+'old']:'1'}});h.run();assert.equal(h.calls[0].event.event_id,'old');
});
test('100件超の検索中にラベルを付けても次ページを飛ばさない',()=>{
 const h=harness(Array.from({length:151},(_,i)=>mail('mail'+i)));h.run();assert.equal(h.calls.length,151);assert.equal(new Set(h.calls.map(c=>c.event.event_id)).size,151);
});
test('新しいキャンセルを先に配送し、旧確定は後から冪等に処理する',()=>{
 const h=harness([mail('confirmed'),mail('cancelled',{cancel:true,date:'2026-10-23T01:00:00Z'})]);h.run();assert.deepEqual(h.calls.map(c=>c.event.state),['cancelled','confirmed']);
});
test('無関係・起動前メールへ処理済みラベルを付けない',()=>{
 const h=harness([mail('other',{from:'other@example.invalid'}),mail('before',{date:'2026-09-01T00:00:00Z'})]);h.run();assert.equal(h.calls.length,0);assert.equal(h.labels.length,0);
});
test('一通が失敗しても他メールとTimee側を実行し、トリガーは失敗を報告する',()=>{
 const h=harness([mail('bad'),mail('good')],{response:e=>e.event_id==='bad'?{status:409,body:{ok:false,code:'TAIMEE_JOB_ID_MISSING'}}:undefined});let timee=0;h.context.processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_=()=>timee++;
 assert.throws(()=>h.context.processSpotOfferConfirmationEmails());assert.equal(h.calls.length,2);assert.equal(timee,1);assert.equal(JSON.parse(h.props.get('SPOT_OFFER_CONFIRMATION_LAST_RUN')).status,'retry_pending');assert.ok(h.props.has(ack+'good'));assert.ok(h.props.has(pending+'bad'));
});
test('同スレッドに後着したメールも、既存ACKを再送せず処理する',()=>{
 const h=harness([mail('done'),mail('new')],{properties:{[ack+'done']:new Date().toISOString()}});h.run();assert.deepEqual(h.calls.map(c=>c.event.event_id),['new']);
});
test('旧100件の処理済みIDリストだけでは新しい受領確認を代用しない',()=>{
 const h=harness([mail('legacy')],{properties:{SHAREFULL_CONFIRMATION_PROCESSED_MESSAGE_IDS:'["legacy"]'}});h.run();assert.equal(h.calls.length,1);
});
test('旧検索設定が確定件名だけでも、送信元の補完検索でキャンセルを取得する',()=>{
 const h=harness([mail('old'),mail('cancel',{cancel:true,date:'2026-10-23T01:00:00Z'})],{properties:{SHAREFULL_CONFIRMATION_GMAIL_QUERY:'from:system@sharefull.com subject:confirmed'}});h.run();assert.deepEqual(h.calls.map(c=>c.event.event_id),['cancel','old']);
});
test('設定不足はトリガー失敗と診断コードに残す',()=>{
 const h=harness([]);h.props.delete('SHAREFULL_CONFIRMATION_GAS_TOKEN');h.context.processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_=()=>{};assert.throws(()=>h.context.processSpotOfferConfirmationEmails());assert.ok(h.logs.some(l=>l.includes('CONFIGURATION_MISSING')));
});
