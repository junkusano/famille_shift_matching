import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
function load(mocks = {}) {
  const ctx = vm.createContext({exports:{},require:n=>n==='server-only'?{}:n==='@/lib/supabase/service'?{supabaseAdmin:mocks.db}:require(n),Date,URL,console});
  vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/lib/knowledge-automation/socialSharing.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return ctx.exports;
}
const p={postId:10,url:'https://shi-on.net/example/',title:'日本語の長い記事タイトル'.repeat(20),revision:'a'.repeat(64),kind:'created',verifiedAt:'2026-09-13T01:00:00Z'};
test('new posts have one stable job per platform; revised content has a separate job',()=>{
  const m=load(), make=(p,platform='x',run='r1')=>m.buildSocialJob(p,platform,'JunKusano_Shion','t1',run,'tenpaku-rpa-02');
  assert.equal(make(p).id,make({...p,revision:'b'.repeat(64)},'x','r2').id);
  assert.notEqual(make(p).id,make(p,'threads').id);
  assert.notEqual(make({...p,kind:'updated'}).id,make({...p,kind:'updated',revision:'b'.repeat(64)}).id);
  for(const kind of ['created','updated']) {
    const j=make({...p,kind});
    assert.ok([...j.payload.text.slice(0,-p.url.length)].length*2+23<=280);
    assert.ok(j.payload.text.endsWith(p.url));
  }
});
test('queue retries preserve the first SNS job after partial DB failure',async()=>{
  const saved=new Map();let fail=true;
  const db={from:()=>({insert:async j=>{
    if(saved.has(j.id))return{error:{code:'23505'}};
    if(j.payload.platform==='threads'&&fail){fail=false;return{error:{code:'network'}};}
    saved.set(j.id,j);return{error:null};
  }})};
  const m=load({db}),task={id:'t1',approval_mode:'automatic',settings:{social_sharing:true,social_runner_id:'tenpaku-rpa-02',social_accounts:{x:'JunKusano_Shion',threads:'famillehelperservice'}}};
  await assert.rejects(m.queueVerifiedBlogShares(task,'r1',p));assert.equal(saved.size,1);
  await m.queueVerifiedBlogShares(task,'r1',p);assert.equal(saved.size,2);
  await m.queueVerifiedBlogShares(task,'r1',p);assert.equal(saved.size,2);
  assert.equal((await m.queueVerifiedBlogShares({...task,approval_mode:'draft'},'r2',p)).length,0);
  assert.equal((await m.queueVerifiedBlogShares({...task,settings:{}},'r2',p)).length,0);
});
test('unexpected destination or missing account/runner never queues',()=>{
 const m=load();
 for(const [post,account,runner] of [[{...p,url:'https://evil.test/a'},'account','runner'],[p,'','runner'],[p,'account','']])assert.throws(()=>m.buildSocialJob(post,'x',account,'t','r',runner));
});
