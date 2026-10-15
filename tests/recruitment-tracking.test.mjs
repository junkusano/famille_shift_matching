import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, mocks={}) {
  const code=ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),module,module.exports);
  return module.exports;
}
const tracking=load('../src/lib/recruitmentTracking.ts');
const journey={journeyId:'11111111-1111-4111-8111-111111111111',source:'myfamille_lp'};
test('未ログインの計測はルートの公開APIへ届き、管理APIは保護する',async()=>{
  const next={next:()=>new Response(null,{status:204}),json:Response.json,redirect:()=>new Response(null,{status:307})};
  const auth={getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}})};
  const m=load('../middleware.ts',{'next/server':{NextResponse:next},'@supabase/auth-helpers-nextjs':{createMiddlewareClient:()=>({auth})}});
  assert.equal((await m.middleware({nextUrl:{pathname:'/api/recruitment-events'}})).status,204);
  assert.equal((await m.middleware({nextUrl:{pathname:'/api/recruitment-analytics'}})).status,401);
});
test('公開計測APIは成功偽装、個人情報、未許可originを拒否する',async()=>{
  const writes=[];const api=load('../src/app/api/recruitment-events/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/recruitmentTracking':tracking,
    '@/lib/supabase/service':{supabaseAdmin:{from:()=>({upsert:async v=>{writes.push(v);return {error:null};}})}},
  });
  const event={...journey,event:'page_view',page:'entry',placement:'body'};
  const request=(v,origin='https://myfamille.shi-on.net')=>new Request('https://myfamille.shi-on.net/api/recruitment-events',{method:'POST',headers:{origin},body:JSON.stringify(v)});
  assert.equal((await api.POST(request(event))).status,204);
  assert.equal((await api.POST(request({...event,event:'submit_success'}))).status,400);
  assert.equal((await api.POST(request({...event,email:'private@example.test'}))).status,400);
  assert.equal((await api.POST(request(event,'https://evil.test'))).status,403);
  assert.equal(writes.length,1);assert.doesNotMatch(JSON.stringify(writes),/email|private/);
});
function submitApi(result,{trackingFails=false}={}){
  const events=[],notifications=[];let rpcCalls=0;
  const api=load('../src/app/api/entry/submit/route.ts',{
    'next/server':{NextResponse:Response},'@/lib/recruitmentTracking':tracking,
    '@/lib/entry/notifications':Object.fromEntries(['notifyRecruitment','sendApplicantGuide','sendNewApplicantConfirmation'].map(k=>[k,async()=>notifications.push(k)])),
    '@/lib/supabase/service':{supabaseAdmin:{rpc:async()=>{rpcCalls++;return {data:result,error:null};},from:()=>({upsert:v=>({abortSignal:async()=>{if(trackingFails)throw Error('offline');events.push(v);return {error:null};}})})}},
  });
  const payload={email:'test@example.test',last_name_kanji:'Test',first_name_kanji:'Applicant',agreed_terms:true,agreed_privacy:true};
  const run=(patch={})=>api.POST(new Request('https://example.test/api/entry/submit',{method:'POST',body:JSON.stringify({submissionId:journey.journeyId,payload:{...payload,...patch},journey})}));
  return {run,events,notifications,get rpcCalls(){return rpcCalls;}};
}
test('サーバーの新規登録だけ成功計測し、再試行は通知・計測を重複しない',async()=>{
  const s=submitApi({kind:'created',idempotent:false});assert.equal((await s.run()).status,200);assert.equal(s.events[0].event,'submit_success');
  assert.doesNotMatch(JSON.stringify(s.events),/Test|Applicant|example|email|submission/);
  const retry=submitApi({kind:'created',idempotent:true});assert.equal((await retry.run()).status,200);assert.equal(retry.events.length,0);assert.equal(retry.notifications.length,0);
});
test('既存応募者を新規登録に数えず、計測障害は応募成功を壊さない',async()=>{
  const s=submitApi({kind:'duplicate_email'});assert.equal((await s.run()).status,200);assert.equal(s.events[0].event,'existing_applicant');
  const failure=submitApi({kind:'created'},{trackingFails:true});assert.equal((await failure.run()).status,200);
  const invalid=submitApi({kind:'unknown'});assert.equal((await invalid.run()).status,500);assert.equal(invalid.events.length,0);
  const blank=submitApi({kind:'created'});assert.equal((await blank.run({last_name_kanji:' '})).status,400);assert.equal(blank.rpcCalls,0);
});
test('ブラウザ計測は公開ページ限定、固定項目のみ、同じ段階を重複しない',()=>{
  const calls=[],handlers={},storage=new Map();const location=new URL('https://myfamille.shi-on.net/entry?email=secret#private');
  const window={addEventListener:(name,fn)=>handlers[name]=fn};
  const document={referrer:'https://outside.test/private?email=secret',addEventListener:(name,fn)=>handlers[name]=fn};
  const context={window,document,location,URL,URLSearchParams,Set,Date,crypto:{randomUUID:()=>journey.journeyId},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},history:{replaceState(){}},fetch:(_,r)=>{calls.push(JSON.parse(r.body));return Promise.resolve();}};
  vm.runInNewContext(fs.readFileSync(new URL('../public/recruitment-tracking.js',import.meta.url),'utf8'),context);
  handlers['recruitment:event']({detail:'form_start'});handlers['recruitment:event']({detail:'form_start'});handlers['recruitment:event']({detail:'submit_success'});
  assert.equal(calls.length,2);assert.doesNotMatch(JSON.stringify(calls),/secret|private|email|outside/);
  location.pathname='/portal';handlers['recruitment:event']({detail:'submit_attempt'});window.__recruitmentTracking();assert.equal(calls.length,2);
});
