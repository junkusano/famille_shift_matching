import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'server-only' ? {} : name in overrides ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const core = load('../src/lib/knowledge-automation/recruitmentAnalyticsCore.ts');
test('JST月曜境界で前週月曜〜日曜を確定し、DB境界は半開区間', () => {
  const before = core.recruitmentPeriods(new Date('2026-10-11T14:59:59Z'));
  const after = core.recruitmentPeriods(new Date('2026-10-11T15:00:00Z'));
  assert.equal(before.current.start, '2026-09-28');
  assert.deepEqual(after.current, { start:'2026-10-05', end:'2026-10-11', from:'2026-10-04T15:00:00.000Z', until:'2026-10-11T15:00:00.000Z' });
  assert.equal(after.previous.until, after.current.from);
  assert.equal(core.recruitmentPeriods(new Date('2027-01-04T00:00:00Z')).current.start, '2026-12-28');
});
test('未取得と実測0を区別し、比較元0から増減率を作らない', () => {
  assert.deepEqual(core.countChange(null, 5), { difference:null, percent:null });
  assert.deepEqual(core.countChange(7, 8), { difference:-1, percent:-12.5 });
  assert.deepEqual(core.countChange(7, 0), { difference:7, percent:null });
});
test('内部画面・UUID・メール・クエリを分析のページURLに残さない', () => {
  assert.equal(core.publicRecruitmentUrl('myfamille.shi-on.net', '/portal/entry-list'), null);
  assert.equal(core.publicRecruitmentUrl('myfamille.shi-on.net', '/entry/abc'), null);
  assert.equal(core.publicRecruitmentUrl('shi-on.net', '/person%40mail.test'), null);
  assert.equal(core.publicRecruitmentUrl('myfamille.shi-on.net', '/entry?email=secret'), 'https://myfamille.shi-on.net/entry');
  assert.equal(core.referrerCategory('https://www.shi-on.net/recruiting/?secret=1'), '採用LP');
  assert.equal(core.referrerCategory('https://myfamille.shi-on.net/'), 'MyFamille LP');
  assert.equal(core.referrerCategory('https://external.test/user/private'), 'その他の参照元');
});

function setup({ duplicate = false, entryError = false, gaFailure = false, race = false } = {}) {
  let aiCalls = 0; let saved; const selections = []; const queries = [];
  const db = { from(table) {
    const state = { table, filters: [] };
    const chain = new Proxy({}, { get: (_, name) => {
      if (name === 'then') return resolve => {
        let result = { data: [], error: null };
        if (table === 'form_entries') result = entryError ? { error:{ code:'oops' },count:null } : { error:null,count:7 };
        if (table === 'knowledge_sources') result.data = [{id:'source',config:{propertyId:'123'}},{id:'duplicate-source',config:{propertyId:'123'}}];
        if (table === 'knowledge_items' && state.filters.some(f => f[0] === 'knowledge_key')) result.data = duplicate ? {id:'existing'} : null;
        if (state.insert) result = race ? {data:null,error:{code:'23505'}} : {data:{id:'saved'},error:null};
        return Promise.resolve(resolve(result));
      };
      return (...args) => { if (name === 'select') selections.push({table,args}); if (name === 'eq') state.filters.push(args); if (name === 'insert') {state.insert=true;saved=args[0];} return chain; };
    } });
    return chain;
  } };
  const implementation = load('../src/lib/knowledge-automation/recruitmentAnalytics.ts', {
    '@/lib/supabase/service': {supabaseAdmin:db}, './recruitmentAnalyticsCore':core,
    '@/lib/openaiProfiles':{OPENAI_PROFILES:{standard:{model:'test'}}},
    '@/lib/knowledge/connectors/googleAnalytics': {createAnalyticsClient:async()=>({properties:{runReport:async(request)=>{queries.push(request);if(gaFailure)throw new Error('secret failure');return {data:{rows:[],rowCount:0}};}}})},
    openai: class { responses = {create:async()=>{aiCalls++;return {model:'test',output_text:JSON.stringify({overview:'根拠を整理',routeAssessment:'経路未確認',contentAssessment:'影響は仮説',improvements:[{priority:'高',target:'LP',evidence:'未計測',hypothesis:'計測不足',action:'確認',metric:'参照元',discussion:'計測設計'}]})};}} },
  });
  return { implementation, get saved(){return saved;}, get aiCalls(){return aiCalls;}, selections, queries };
}
const task = {id:'task',task_type:'custom',destination:'none'};
test('応募情報は件数のみ取得、重複GA4設定は一度だけ集計、取得失敗を明記', async () => {
  const s = setup({entryError:true,gaFailure:true});
  const report = await s.implementation.collectRecruitmentEvidence(new Date('2026-10-10T00:00:00Z'));
  assert.equal(report.current.entries,null);
  assert.equal(s.queries.length,6);
  assert.ok(report.current.warnings.some(w=>w.includes('取得できません')));
  assert.doesNotMatch(JSON.stringify(report),/secret failure/);
  for (const selection of s.selections.filter(s=>s.table==='form_entries')) assert.deepEqual(selection.args,['id',{count:'exact',head:true}]);
});
test('レポートと改善案を同一ナレッジに保存、承認前の仮説として扱う', async () => {
  const s=setup();const result=await s.implementation.runRecruitmentAnalytics(task,new Date('2026-10-10T00:00:00Z'));
  assert.equal(result.status,'created');assert.equal(s.saved.knowledge_key,'recruitment-analytics:2026-09-28');
  assert.equal(s.saved.publishability,'internal_only');assert.equal(s.saved.review_status,'needs_review');
  assert.equal(s.saved.contains_personal_data,false);assert.match(s.saved.content,/仮説/);
});
test('手動の二重実行と保存時の競合は重複レポートを作らない', async () => {
  const s=setup({duplicate:true});assert.equal((await s.implementation.runRecruitmentAnalytics(task)).status,'skipped');assert.equal(s.aiCalls,0);
  const race=setup({race:true});assert.equal((await race.implementation.runRecruitmentAnalytics(task)).status,'skipped');
});
test('外部通知先への誤設定を拒否する', async () => {
  const s=setup();await assert.rejects(s.implementation.runRecruitmentAnalytics({...task,destination:'lineworks_message'}),/保存のみ/);assert.equal(s.aiCalls,0);
});

test('レポートAPIは未認証・権限なしでDBを読まない', async () => {
  let calls=0;
  const api=load('../src/app/api/recruitment-analytics/route.ts', {
    'next/server':{NextResponse:Response}, '@/lib/auth/requireManagerOrAdmin':{requireManagerOrAdmin:async()=>new Response('',{status:403})},
    '@/lib/supabase/service':{supabaseAdmin:{from(){calls++;throw new Error('unexpected');}}},
    '@/lib/knowledge-automation/recruitmentAnalyticsCore':core,
  });
  assert.equal((await api.GET(new Request('https://example.test'))).status,403);assert.equal(calls,0);
});

test('日次集計はcron認証を必須にし、一方の情報源失敗でも他方を実行する', async () => {
  const prior=process.env.CRON_SECRET;process.env.CRON_SECRET='test-only-secret';
  const calls=[];const filters=[];
  const chain=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>resolve({data:[{id:'ga'},{id:'clarity'}],error:null}):(...args)=>{filters.push([name,...args]);return chain;}});
  const api=load('../src/app/api/cron/knowledge-analytics-sync/route.ts', {
    'next/server':{NextResponse:Response}, '@/lib/supabase/service':{supabaseAdmin:{from:()=>chain}},
    '@/lib/knowledge/pipeline':{runKnowledgeSource:async({sourceId})=>{calls.push(sourceId);if(sourceId==='ga')throw new Error('private error');return {runId:'ok'};}},
  });
  try {
    assert.equal((await api.GET(new Request('https://example.test'))).status,401);assert.equal(calls.length,0);
    const response=await api.GET(new Request('https://example.test',{headers:{authorization:'Bearer test-only-secret'}}));
    assert.equal(response.status,500);assert.deepEqual(calls,['ga','clarity']);
    assert.doesNotMatch(await response.text(),/private error/);
    assert.ok(filters.some(f=>f[0]==='in'&&f[1]==='connector_key'&&f[2].includes('microsoft_clarity')));
  } finally {if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
});
