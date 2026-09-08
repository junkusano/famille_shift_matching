import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name === 'server-only' ? {} : name in overrides ? overrides[name] : require(name), module, module.exports);
  return module.exports;
}
const core = load('../src/lib/knowledge-automation/diagnosticsCore.ts');
test('ログのリクエスト重複と同一リクエスト内の重複を除き、秘密値を保存しない', () => {
  const row = { requestId: 'a', requestPath: '/api/cron/knowledge-sync?token=secret', logs: [{ level: 'error', message: 'Task timed out token=secret alice@example.com' }, { level: 'error', message: 'Task timed out' }] };
  const result = core.aggregateRuntime([row, row, { ...row, requestId: 'b' }]);
  assert.equal(result.length, 1); assert.equal(result[0].count, 2);
  assert.equal(result[0].route, '/api/cron/knowledge-sync');
  assert.doesNotMatch(JSON.stringify(result), /secret|alice/);
});
test('欠測時に消えた問題を解消済みにしない', () => {
  const old = [{ key: 'x', count: 1 }];
  assert.deepEqual(core.compareFindings([], old, false).resolved, []);
  assert.deepEqual(core.compareFindings([], old, true).resolved, ['x']);
  assert.deepEqual(core.compareFindings([{ key: 'x', count: 2 }], old, false).worsened, ['x']);
});
test('GitHubは1500件を超えても欠落せず、途中のHEAD変更でページを飛ばさない', async () => {
  const saved = global.fetch;
  const keys = ['GITHUB_KNOWLEDGE_APP_ID', 'GITHUB_KNOWLEDGE_PRIVATE_KEY', 'GITHUB_KNOWLEDGE_INSTALLATION_ID'];
  const env = keys.map(key => process.env[key]); keys.forEach(key => delete process.env[key]);
  let head = 'old'; let branches = 0;
  global.fetch = async (url, options) => {
    assert.ok(options.signal);
    if (String(url).includes('/branches/')) { branches++; return Response.json({ commit: { sha: head } }); }
    if (String(url).includes('/git/commits/')) return Response.json({ tree: { sha: 'tree' } });
    return Response.json({ truncated: false, tree: Array.from({length: 1511}, (_, i) => ({path: `src/lib/f${String(i).padStart(4,'0')}.ts`, type:'blob',sha:`blob${i}`})) });
  };
  try {
    const { githubConnector } = load('../src/lib/knowledge/connectors/github.ts', { jose: {} });
    let cursor = {}; const names = [];
    for (let page = 0; page < 62; page++) {
      const result = await githubConnector.fetchDelta({ source: { config: { repository:'org/repo',branch:'main' } }, cursor, signal:new AbortController().signal });
      assert.ok(result.objects.length <= 25);
      names.push(...result.objects.map(item => item.externalId)); cursor = result.nextCursor; head = 'new';
      if (!result.hasMore) break;
      assert.notEqual(cursor.lastCommitSha, 'old');
    }
    assert.equal(names.length,1511); assert.equal(new Set(names).size,1511); assert.equal(cursor.lastCommitSha,'old'); assert.equal(branches,1);
  } finally { global.fetch = saved; keys.forEach((key,i) => env[i] === undefined ? delete process.env[key] : process.env[key]=env[i]); }
});
test('GitHubの不完全な一覧は完了扱いしない', async () => {
  const saved = global.fetch;
  global.fetch = async url => Response.json(String(url).includes('/branches/') ? {commit:{sha:'x'}} : String(url).includes('/git/commits/') ? {tree:{sha:'tree'}} : {truncated:true,tree:[]});
  try {
    const { githubConnector } = load('../src/lib/knowledge/connectors/github.ts', { jose: {} });
    await assert.rejects(githubConnector.fetchDelta({source:{config:{repository:'org/repo',branch:'main'}},cursor:{},signal:new AbortController().signal}),/完全に取得/);
  } finally {global.fetch=saved;}
});
test('診断情報が取れなければ正常判定せず結果に残す', async () => {
  const chain = new Proxy({}, { get: (_, name) => name === 'then' ? resolve => resolve({ data:null,error:null }) : () => chain });
  const { runSystemDiagnostics } = load('../src/lib/knowledge-automation/diagnostics.ts', {
    '@/lib/supabase/service': {supabaseAdmin:{from:()=>chain}},
    '@/lib/knowledge-automation/diagnosticsCore': core,
  });
  const result = await runSystemDiagnostics({id:'task',destination:'none'});
  assert.equal(result.audit.failed,true); assert.equal(result.audit.coverage.filter(x=>x.status==='failed').length,2);
  assert.deepEqual(result.audit.changes.resolved,[]);
  await assert.rejects(runSystemDiagnostics({id:'task',destination:'wordpress_post'}),/保存のみ/);
});

test('診断の取得成功・ページング・ナレッジ照合を保存用結果にまとめる', async () => {
  const keys = ['DIAGNOSTICS_VERCEL_TOKEN','DIAGNOSTICS_VERCEL_PROJECT_ID','DIAGNOSTICS_VERCEL_TEAM_ID','DIAGNOSTICS_SUPABASE_ACCESS_TOKEN','DIAGNOSTICS_SUPABASE_PROJECT_REF'];
  const original = keys.map(key=>process.env[key]); keys.forEach(key=>process.env[key]='test');
  const saved = global.fetch; let requests = 0;
  global.fetch = async url => {
    requests++;
    if (url.hostname === 'vercel.com') return Response.json({rows:[{requestId:'r1',requestPath:'/api/cron/knowledge-sync',logs:[{level:'error',message:'Task timed out after 300 seconds'}]}],hasMoreRows:false});
    return Response.json({lints:[{level:'ERROR',name:'rls_disabled_in_public',metadata:{schema:'public',name:'env_variables'},detail:'PRIVATE SECRET CONTENT'}]});
  };
  const db = {from(table) {
    const data = table === 'knowledge_source_objects' ? [{title:'src/app/api/cron/knowledge-sync/route.ts'}] : table === 'knowledge_items' ? [{id:'k',public_summary:'確認済みの対処手順',updated_at:'2026-09-08'}] : null;
    const chain = new Proxy({}, {get:(_,name)=>name==='then'? resolve=>resolve({data,error:null}):()=>chain}); return chain;
  }};
  try {
    const {runSystemDiagnostics}=load('../src/lib/knowledge-automation/diagnostics.ts',{'@/lib/supabase/service':{supabaseAdmin:db},'@/lib/knowledge-automation/diagnosticsCore':core});
    const result = await runSystemDiagnostics({id:'t',destination:'none'});
    assert.equal(requests,3); assert.equal(result.audit.failed,false); assert.equal(result.audit.findings.length,2);
    assert.deepEqual(result.audit.findings[0].codePaths,['src/app/api/cron/knowledge-sync/route.ts']);
    assert.equal(result.audit.relatedKnowledge[0].summary,'確認済みの対処手順');
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE SECRET/);
    assert.deepEqual(result.audit.changes.resolved,[]);
  } finally {global.fetch=saved;keys.forEach((key,i)=>original[i]===undefined?delete process.env[key]:process.env[key]=original[i]);}
});

function pipelineFixture(failObject = false) {
  const events = [];
  const db = { from(table) {
    let operation = 'select';
    const query = new Proxy({}, { get: (_, name) => {
      if (name === 'then') return resolve => {
        events.push(`${table}:${operation}`);
        let data = null; let error = null;
        if (table === 'knowledge_sources' && operation === 'select') data = {id:'s',connector_key:'github'};
        if (table === 'knowledge_source_checkpoints' && operation === 'select') data = {cursor:{},cursor_version:0};
        if (table === 'knowledge_sync_runs' && operation === 'insert') data = {id:'run'};
        if (table === 'knowledge_source_objects' && operation === 'insert') {data={id:'o'};if(failObject)error={message:'write failed'};}
        if (table === 'knowledge_source_checkpoints' && operation === 'update') data = [{source_id:'s'}];
        resolve({data,error});
      };
      return () => { if (['insert','update','upsert'].includes(name)) operation=name; return query; };
    }});
    return query;
  }};
  const module = load('../src/lib/knowledge/pipeline.ts', {
    '@supabase/supabase-js':{createClient:()=>db}, '@/lib/supabase/service':{supabaseAdmin:db},
    '@/lib/knowledge/connectors/registry':{getKnowledgeConnector:()=>({fetchDelta:async()=>({objects:[{externalId:'a',objectType:'github_file',sourceRevision:'sha',contentHash:'hash',metadata:{}}],proposedKnowledge:[],nextCursor:{scanSha:'sha',scanOffset:1},hasMore:true,warnings:[]})})},
    '@/lib/knowledge/scheduling':{calculateNextRunAt:()=>{throw new Error('継続ページを通常の次回日付に遅延させてはいけない');}},
    '@/lib/knowledge/privacy':{secureSourceObject:(_,object)=>object,secureProposedKnowledge:(_,proposal)=>proposal},
  });
  return {module,events};
}
test('同期は保存完了後にだけチェックポイントを進める', async () => {
  const {module,events}=pipelineFixture();
  const result=await module.runKnowledgeSource({sourceId:'s',jobType:'incremental',triggerType:'cron'});
  assert.equal(result.cursorAfter.scanOffset,1);
  assert.ok(events.indexOf('knowledge_source_checkpoints:update') > events.indexOf('knowledge_source_objects:insert'));
});
test('保存失敗時はチェックポイントを進めず再試行可能にする', async () => {
  const {module,events}=pipelineFixture(true);
  await assert.rejects(module.runKnowledgeSource({sourceId:'s',jobType:'incremental',triggerType:'cron'}));
  assert.ok(!events.includes('knowledge_source_checkpoints:update'));
});
