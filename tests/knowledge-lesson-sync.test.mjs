import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(file,mocks={}){
 const context=vm.createContext({exports:{},require:n=>n in mocks?mocks[n]:require(n),Error,Date,AbortController,AbortSignal,URL,process});
 vm.runInContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;
}
function harness(sheets){
 const google = {
   auth: {GoogleAuth: class {}},
   sheets: () => ({spreadsheets: {values: {
     get: async ({range}) => ({data: {values: sheets[range.match(/^'(.+)'!/)[1]]}}),
   }}}),
 };
 const m=load('../src/lib/knowledge/connectors/googleSheets.ts', {
   'server-only': {},
   '@/lib/supabase/service': {supabaseAdmin: {rpc: async()=>({data:'{}'})}},
   googleapis: {google},
 });
 const source={config:{mode:'lesson_index',spreadsheetId:'sheet-id-for-test',sheets:Object.keys(sheets).map(name=>({name,headerRow:1})),maxRows:3000},default_privacy_level:3,default_publishability:'never_publish'};
 return {source,fetch:(cursor={})=>m.googleSheetsConnector.fetchDelta({source,cursor,dryRun:false,signal:new AbortController().signal})};
}
const header=['No.','カテゴリ','リマインド'];
test('large sheet advances in bounded batches without acknowledging unprocessed rows',async()=>{
 const rows=[header,...Array.from({length:61},(_,i)=>[i+1,'組織運営','教訓 '+i])];const h=harness({'For全マネジャー':rows});
 let cursor={normalizationVersion:2,rowHashes:{}};const seen=[];
 for(let i=0;i<3;i++){const r=await h.fetch(cursor);assert.ok(r.objects.length<=25);assert.equal(r.hasMore,i<2);seen.push(...r.objects.map(o=>o.externalId));cursor=r.nextCursor;assert.equal(Object.keys(cursor.rowHashes['For全マネジャー']).length,Math.min((i+1)*25,61));}
 assert.equal(new Set(seen).size,61);const final=await h.fetch(cursor);assert.equal(final.objects.length,0);assert.equal(final.hasMore,false);
 rows[61][2]='変更後';const delta=await h.fetch(cursor);assert.equal(delta.objects.length,1);assert.equal(delta.objects[0].externalId,'For全マネジャー:62');
});
test('all manager sheet aliases import restricted lessons; other audiences remain pointer-only',async()=>{
 const h=harness(Object.fromEntries(['For全マネジャー','Forマネジャー','Forヘルパーマネジャー','Forヘルパー','総務チームリマインド'].map(name=>[name,[header,[1,'管理','個人情報を含む原文']]])));
 const r=await h.fetch();assert.equal(r.objects.length,5);assert.equal(r.proposedKnowledge.length,3);
 for(const k of r.proposedKnowledge){assert.equal(k.privacyLevel,3);assert.equal(k.publishability,'never_publish');assert.equal(k.knowledgeType,'lesson_principle');assert.equal(k.metadata.rowNumber,2);assert.equal(k.publicSummary,undefined);}
 for(const o of r.objects){assert.equal(o.safeExcerpt,undefined);assert.equal(o.containsPersonalData,true);assert.doesNotMatch(o.title,/個人情報/);}
});
test('batching continues into following sheets and retains hashes of untouched rows',async()=>{
 const sheets={'For全マネジャー':[header,...Array.from({length:26},(_,i)=>[i,'','教訓'+i])],'Forマネジャー':[header,[1,'','次のシート']]};const h=harness(sheets);
 const first=await h.fetch();assert.equal(first.nextCursor.rowHashes['Forマネジャー']['2'],undefined);
 const second=await h.fetch(first.nextCursor);assert.equal(second.objects.length,2);assert.equal(second.hasMore,false);
 const last=await h.fetch(second.nextCursor);assert.equal(last.objects.length,0);
});
test('observed changes beyond the batch limit are visible to publication checks',async()=>{
 const rows=[header,...Array.from({length:26},(_,i)=>[i,'','旧教訓'+i])];const h=harness({'For全マネジャー':rows});
 let r=await h.fetch();r=await h.fetch(r.nextCursor);const previous=r.nextCursor;
 rows.slice(1).forEach(row=>row[2]+='変更');const changed=await h.fetch(previous);
 assert.equal(changed.hasMore,true);assert.equal(changed.nextCursor.rowHashes['For全マネジャー']['27'],previous.rowHashes['For全マネジャー']['27']);
 assert.notEqual(changed.nextCursor.observedRowHashes['For全マネジャー']['27'],previous.rowHashes['For全マネジャー']['27']);
});
const {safeSyncError}=load('../src/lib/knowledge/syncErrors.ts');
test('plain database errors preserve actionable code without leaking row details',()=>{
 const e=safeSyncError({code:'23505',message:'duplicate patient@example.com',details:'secret private row'});assert.equal(e.code,'23505');assert.doesNotMatch(e.message,/patient|secret|private/);
 assert.equal(safeSyncError({message:'TimeoutError: operation aborted'}).code,'SYNC_TIMEOUT');
 assert.equal(safeSyncError(new Error('api_key=secret-value')).code,'CONNECTION_FAILED');
});
