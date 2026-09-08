import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
function loadModule(path,mocks={}) {
 const c=vm.createContext({exports:{},require:n=>n in mocks?mocks[n]:require(n),Date,URL,URLSearchParams,Map,Set,Buffer,Headers,AbortSignal,fetch:globalThis.fetch,process});
 vm.runInContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;
}
const policy=loadModule('../src/lib/knowledge-automation/rewritePolicy.ts');
const original='<p>'+('元の説明文です。'.repeat(100))+'</p><img src="https://site.test/photo.jpg"><a href="https://site.test/info">詳細</a>';
const proposed=original.replace('元の説明文です。'.repeat(100),'分かりやすい具体的な説明です。'.repeat(100));
const base={id:1,status:'publish',link:'https://site.test/blog/a/',modified_gmt:'2026-08-01T00:00:00',date_gmt:'2026-07-01T00:00:00',title:{raw:'記事'},content:{raw:original},slug:'a'};
const now=Date.parse('2026-09-08T01:00:00Z');
test('計測欠損をゼロ扱いしない',()=>{assert.equal(policy.rankRewriteCandidates([base],new Map(),30,now).length,0);assert.equal(policy.rankRewriteCandidates([base],new Map([['/blog/a/',0]]),30,now).length,1);});
test('古い記事は計測なしでも候補・最近更新した記事は除外',()=>{const old={...base,modified_gmt:'2025-01-01T00:00:00'};assert.equal(policy.rankRewriteCandidates([old],new Map(),30,now).length,1);assert.equal(policy.rankRewriteCandidates([{...base,modified_gmt:'2026-09-07T00:00:00'}],new Map([['/blog/a/',0]]),30,now).length,0);});
test('画像リンクを保持した本文更新は許可',()=>assert.equal(policy.validateRewrite(original,proposed),proposed));
test('本文の消失・画像削除・リンク削除・スクリプト追加を拒否',()=>{for(const bad of ['<p>短い</p>',proposed.replace(/<img[^>]*>/,''),proposed.replace(/<a.*<\/a>/,''),proposed+'<script>alert(1)</script>',proposed.replace('<p>','<p onclick="alert(1)">')])assert.throws(()=>policy.validateRewrite(original,bad));});
test('ブロックとショートコードの改変を拒否',()=>{assert.throws(()=>policy.validateRewrite('<!-- wp:paragraph -->'+original+'<!-- /wp:paragraph -->',proposed));assert.throws(()=>policy.validateRewrite(original+'[gallery ids="1"]',proposed));});
test('公開記事は本文だけ更新し、再取得と公開表示を確認',async()=>{
 const calls=[];const saved={...base,content:{raw:proposed}};
 const module=loadModule('../src/lib/wordpress/blogPosts.ts',{'server-only':{},'@/lib/wordpress/server':{assertNoInternalReferenceLinks:()=>{},wordpressFetch:async(path,init)=>{calls.push({path,init});if(init)return{data:saved};if(path.includes('context=view'))return{data:{...saved,content:{rendered:proposed}}};return{data:calls.length===1?base:saved};}}});
 const prev=globalThis.fetch; // loader captures fetch, so use a fresh module for page verification.
 globalThis.fetch=async()=>({ok:true,text:async()=>proposed});
 try {const m=loadModule('../src/lib/wordpress/blogPosts.ts',{'server-only':{},'@/lib/wordpress/server':{assertNoInternalReferenceLinks:()=>{},wordpressFetch:async(path,init)=>{calls.push({path,init});if(init)return{data:saved};if(path.includes('context=view'))return{data:{...saved,content:{rendered:proposed}}};return{data:calls.length===1?base:saved};}}});await m.updatePublishedBlogPost(base,proposed);assert.deepEqual(JSON.parse(calls.find(c=>c.init).init.body),{content:proposed});}finally{globalThis.fetch=prev;}
});
test('他の編集者が更新した記事に上書きしない',async()=>{
 let wrote=false;const m=loadModule('../src/lib/wordpress/blogPosts.ts',{'server-only':{},'@/lib/wordpress/server':{assertNoInternalReferenceLinks:()=>{},wordpressFetch:async(_,init)=>{if(init)wrote=true;return{data:{...base,modified_gmt:'2026-09-08T00:00:00'}};}}});await assert.rejects(m.updatePublishedBlogPost(base,proposed));assert.equal(wrote,false);
});
test('公開ページが古い本文のままなら成功扱いにしない',async()=>{
 const prev=globalThis.fetch;globalThis.fetch=async()=>({ok:true,text:async()=>original});
 try {const m=loadModule('../src/lib/wordpress/blogPosts.ts',{'server-only':{},'@/lib/wordpress/server':{wordpressFetch:async()=>({data:{id:base.id,status:'publish',content:{rendered:proposed}}})}});await assert.rejects(m.verifyPublishedBlogPost(base,proposed));}finally{globalThis.fetch=prev;}
});
test('新規作成APIは明示した公開状態を保存し、デフォルトは下書き',async()=>{
 const prev=globalThis.fetch, env={...process.env};const bodies=[];
 process.env.WORDPRESS_API_URL='https://site.test/wp-json/wp/v2/';process.env.WORDPRESS_USERNAME='test';process.env.WORDPRESS_APP_PASSWORD='test';
 globalThis.fetch=async(_,init)=>({ok:true,headers:new Headers(),json:async()=>{if(!init.body)return [];const body=JSON.parse(init.body);bodies.push(body);return{id:2,title:{raw:body.title},status:body.status,slug:body.slug,link:'https://site.test/new/',modified:'2026-09-08'};}});
 try {const m=loadModule('../src/lib/wordpress/server.ts',{'server-only':{}});for(const status of [undefined,'draft','publish'])await m.createWordPressPost({title:'記事',slug:'new',content:'<p>本文</p>',excerpt:'説明',...(status?{status}:{})});assert.deepEqual(bodies.map(b=>b.status),['draft','draft','publish']);}finally{globalThis.fetch=prev;for(const key of ['WORDPRESS_API_URL','WORDPRESS_USERNAME','WORDPRESS_APP_PASSWORD']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
test('リライトは新規記事作成へ流さず、同日の再実行を防ぐ',async()=>{
 let rewrites=0,creates=0;const keys=new Set();
 const task={id:'task1',task_type:'custom',destination:'wordpress_post',settings:{operation:'wordpress_blog_rewrite'},is_enabled:true,trigger_type:'daily',schedule:{times:['10:00']}};
 const db={from:table=>{let inserted;const q={select:()=>q,eq:()=>q,update:()=>q,insert:value=>{inserted=value;return q},maybeSingle:async()=>({data:task}),single:async()=>{if(table==='knowledge_automation_runs'){if(keys.has(inserted.idempotency_key))return{error:{code:'23505'}};keys.add(inserted.idempotency_key);return{data:{id:'run1'}};}return{data:task};}};return q;}};
 class WPError extends Error{}
 const m=loadModule('../src/lib/knowledge-automation/runner.ts',{'server-only':{},'@/lib/knowledge-automation/scheduling':{calculateAutomationNextRunAt:()=>new Date(Date.now()+86400000).toISOString()},'@/lib/supabase/service':{supabaseAdmin:db},'@/lib/wordpress/server':{WordPressApiError:WPError},'@/lib/knowledge-automation/wordpressRewrite':{rewriteWordPressBlog:async()=>{rewrites++;return{status:'updated',message:'更新完了',postId:1,postLink:'https://site.test/a/'}}},'@/lib/knowledge-automation/wordpressBlog':{createWordPressBlogDraft:async()=>{creates++;return{status:'created',message:'新規作成'}}}});
 assert.equal((await m.runKnowledgeAutomationTask({taskId:task.id,triggerSource:'manual'})).status,'succeeded');
 assert.equal((await m.runKnowledgeAutomationTask({taskId:task.id,triggerSource:'schedule'})).status,'skipped');
 assert.equal(rewrites,1);assert.equal(creates,0);
});
