import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}){
 const context=vm.createContext({exports:{},require:n=>n in mocks?mocks[n]:require(n),Error,Date,Map,Set,process});
 vm.runInContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;
}
const policy=load('../src/lib/knowledge/lessonEditorialPolicy.ts');
const original=(i=0)=>({id:'raw-'+i,primary_source_id:'source',knowledge_key:'lesson:sheet:For全マネジャー:'+i,knowledge_type:'lesson_principle',summary:'人を囲い込まず成長させる'+i,content:null,is_current:true,metadata:{sheetName:'For全マネジャー',rowNumber:i,sourceRevision:'revision-'+i},updated_at:'2026-10-17T00:00:00Z'});
const cursor=rows=>({rowHashes:{For全マネジャー:Object.fromEntries(rows.map(r=>[r.metadata.rowNumber,r.metadata.sourceRevision]))}});
const derivative=(raw,extra={})=>({id:'public-'+raw.id,primary_source_id:'source',parent_knowledge_id:raw.id,knowledge_key:policy.lessonJobKey(raw),is_current:true,knowledge_type:'lesson_principle',public_summary:'公開用の原則',review_status:'approved',privacy_level:0,publishability:'public',redaction_status:'completed',contains_personal_data:false,approved_at:'2026-10-17T01:00:00Z',metadata:{lessonEditorial:{sourceFingerprint:policy.lessonFingerprint(raw)}},...extra});
function harness(raws=[original()],extras=[],options={}){
 const rows=[...raws,...extras].map(r=>structuredClone(r));let cp=cursor(raws);let sequence=0;const writes=[];
 const db={from(table){let filters=[],start=0,end=Infinity,action='read',payload,single=false;
 const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},like(k,v){filters.push(r=>r[k]?.startsWith(v.slice(0,-1)));return q},not(k,op,v){filters.push(r=>r[k]!=null);return q},order(){return q},range(a,b){start=a;end=b;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(v){action='insert';payload=v;return q},update(v){action='update';payload=v;return q},then(resolve,reject){return Promise.resolve().then(()=>{
  if(options.readError&&action==='read'&&table==='knowledge_items')return{data:null,error:{code:'offline'}};
  if(table==='knowledge_sources')return{data:{id:'source'},error:null};
  if(table==='knowledge_source_checkpoints')return{data:{cursor:cp},error:null};
  if(action==='insert'){
   if(options.insertError)return{data:null,error:{code:options.insertError}};
   if(rows.some(r=>r.knowledge_key===payload.knowledge_key))return{data:null,error:{code:'23505'}};
   rows.push({...structuredClone(payload),id:'new-'+sequence++,is_current:true});writes.push(payload);return{data:null,error:null};
  }
  const found=rows.filter(r=>filters.every(f=>f(r))).slice(start,end+1);
  if(action==='update'){if(options.updateError)return{data:null,error:{code:'offline'}};for(const r of found)Object.assign(r,structuredClone(payload));writes.push(payload);return{data:null,error:null};}
  return{data:single?found[0]??null:found,error:null};
 }).then(resolve,reject)} };return q}};
 const mod=load('../src/lib/knowledge/lessonEditorial.ts',{'server-only':{},'@/lib/supabase/service':{supabaseAdmin:db},'./lessonEditorialPolicy':policy});
 return{rows,writes,run:()=>mod.refreshLessonEditorial(db),current:id=>mod.isLessonPublicationCurrent(id,db),setCursor:v=>{cp=v}};
}
test('revision fingerprint includes content and sheet revision',()=>{
 const r=original();assert.notEqual(policy.lessonFingerprint(r),policy.lessonFingerprint({...r,summary:'変更'}));assert.notEqual(policy.lessonFingerprint(r),policy.lessonFingerprint({...r,metadata:{...r.metadata,sourceRevision:'new'}}));
 assert.equal(policy.originalIsCurrent(r,cursor([r])),true);assert.equal(policy.originalIsCurrent(r,cursor([])),false);
});
test('known change awaiting persistence blocks the prior summary',()=>{
 const r=original(),cp=cursor([r]);cp.observedRowHashes={For全マネジャー:{0:'observed-new-revision'}};
 assert.equal(policy.originalIsCurrent(r,cp),false);
});
test('new lessons enqueue restricted review items once without copying originals',async()=>{
 const r=original();const h=harness([r]);const first=await h.run();assert.equal(first.queued,1);assert.equal(first.needsReview,1);
 const pending=h.rows.find(x=>x.parent_knowledge_id===r.id);assert.equal(pending.privacy_level,3);assert.equal(pending.publishability,'never_publish');assert.equal(pending.public_summary,null);assert.notEqual(pending.summary,r.summary);
 assert.equal((await h.run()).queued,0);assert.equal(h.rows.length,2);assert.deepEqual(h.rows[0],r);
});
test('source change retires old approved derivative and queues new revision',async()=>{
 const r=original();const old=derivative(r);const changed={...r,summary:'変更後',metadata:{...r.metadata,sourceRevision:'changed'}};const h=harness([changed],[old]);
 assert.equal(await h.current(old.id),false);const out=await h.run();assert.equal(out.obsolete,1);assert.equal(out.queued,1);assert.equal(h.rows.find(x=>x.id===old.id).publishability,'never_publish');
});
test('removed sheet row cannot supply an approved summary',async()=>{
 const r=original(),d=derivative(r),h=harness([r],[d]);h.setCursor(cursor([]));assert.equal(await h.current(d.id),false);const out=await h.run();assert.equal(out.queued,0);assert.equal(out.obsolete,1);
});
test('missing checkpoint fails closed instead of treating every source as deleted',async()=>{
 const r=original(),h=harness([r],[derivative(r)]);h.setCursor({});await assert.rejects(h.run(),/同期が未完了/);assert.equal(h.writes.length,0);
});
test('pagination and bounded writes eventually cover every lesson',async()=>{
 const raws=Array.from({length:121},(_,i)=>original(i));const h=harness(raws);
 for(let i=0;i<7;i++){const out=await h.run();assert.equal(out.originals,121);assert.ok(out.queued<=20);}
 assert.equal(h.rows.filter(r=>r.parent_knowledge_id).length,121);assert.equal((await h.run()).remaining,0);
});
test('concurrent duplicate insertion is safe but database failures surface',async()=>{
 assert.equal((await harness([original()],[],{insertError:'23505'}).run()).queued,0);
 await assert.rejects(harness([original()],[],{insertError:'offline'}).run(),/確認待ち/);
 await assert.rejects(harness([original()],[],{readError:true}).run(),/改訂履歴/);
});
test('publication gate honors approval revocation and raw changes during generation',async()=>{
 const r=original(),d=derivative(r),h=harness([r],[d]);assert.equal(await h.current(d.id),true);
 h.rows[1].review_status='needs_review';assert.equal(await h.current(d.id),false);h.rows[1].review_status='approved';h.rows[0].summary='生成中に変更';assert.equal(await h.current(d.id),false);
});
test('existing eight timestamp-based approvals remain valid only while raw is unchanged',async()=>{
 const r=original(),d=derivative(r,{metadata:{derivedFromKnowledgeId:r.id}}),h=harness([r],[d]);assert.equal(await h.current(d.id),true);assert.equal((await h.run()).queued,0);
 h.rows[0].updated_at='2026-10-17T02:00:00Z';assert.equal(await h.current(d.id),false);assert.equal((await h.run()).obsolete,1);
});
test('reverted source requires reapproval, does not silently resurrect old approval',async()=>{
 const r=original(),d=derivative(r,{review_status:'superseded',publishability:'never_publish'}),h=harness([r],[d]);const out=await h.run();assert.equal(out.needsReview,1);assert.equal(h.rows[1].review_status,'needs_review');assert.equal(h.rows[1].approved_at,null);assert.equal(await h.current(d.id),false);
});
