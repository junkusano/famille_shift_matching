import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), ts=require('typescript');
function moduleAt(file,mocks={}) {
 const context=vm.createContext({exports:{},require:n=>n in mocks?mocks[n]:require(n),Date,URL,URLSearchParams,Map,Set,Buffer,Headers,AbortSignal,fetch:globalThis.fetch,process});
 vm.runInContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return context.exports;
}
const policy=moduleAt('../src/lib/knowledge-automation/blogDiversity.ts');
test('WordPress punctuation transforms match without ignoring changed numbers or words',()=>{
 assert.equal(policy.publicationText('<p>公式資料 - Ministry "Guide" ...</p>'),policy.publicationText('<p>公式資料 &#8211; Ministry &#8220;Guide&#8221; &#8230;</p>'));
 assert.notEqual(policy.publicationText('<p>2年で200円</p>'),policy.publicationText('<p>5年で200円</p>'));
});
test('published source survives date changes and WordPress duplicate slug suffix',()=>{
 const id='80b2f759-aaaa-bbbb-cccc-000000000000';
 for(const slug of ['smart-ai-20260916-80b2f759','smart-ai-20260921-80b2f759-2']) assert.equal(policy.sourceWasPublished(id,[{slug}]),true);
 assert.equal(policy.sourceWasPublished(id,[{slug:'smart-ai-20260916-87a4cebd'}]),false);
});
test('history includes conclusions, excludes private drafts and is bounded',()=>{
 const posts=Array.from({length:35},(_,i)=>({id:i,slug:'test',status:i===0?'private':'publish',title:{raw:'題'},content:{raw:'<p>冒頭</p><h2>結論</h2><p>固有の結論</p>'}}));
 const recent=policy.editorialHistory(posts);assert.equal(recent.length,30);assert.equal(recent[0].id,1);assert.match(recent[0].content,/固有の結論/);
});
function harness({history=[],historyError=false,runError=false,distinct=true,verifyError=false}={}) {
 process.env.OPENAI_API_KEY??='test';const calls=[];const seed={id:'80b2f759-aaaa-bbbb-cccc-000000000000',title:'新しい題材',summary:'別の読者の問い',content:'具体的な内容',metadata:{articleCandidate:'高'},category:'採用'};
 const article={title:'新人が質問できる職場づくりを考える',excerpt:'概要'.repeat(30),thesis:'主張'.repeat(45),trigger_heading:'最初の具体的な場面',trigger_body:'場面'.repeat(100),tension_heading:'質問する側が感じること',tension_body:'課題'.repeat(150),viewpoint_heading:'先輩と管理者の役割を考える',viewpoint_body:'視点'.repeat(150),action_heading:'実際の仕事で試せる工夫',actions:['行動'.repeat(100),'提案'.repeat(100)],conclusion:'結論'.repeat(100),category_id:null,featured_image_search_terms:['新人','相談'],featured_image_prompt:'写真'.repeat(50),featured_image_alt:'新人と先輩が相談する場面を示す写真'};
 const db={from(table){const q={select(){return q},eq(){return q},not(){return q},in(){return q},lte(){return q},order(){return q},limit(){return q},update(value){calls.push(['record',value]);return q},then(resolve){
  if(table==='knowledge_sources')return Promise.resolve({data:[{id:'s',source_key:'kusano-thought-log'}]}).then(resolve);
  if(table==='knowledge_automation_runs')return Promise.resolve({data:[],error:runError?{message:'offline'}:null}).then(resolve);
  if(table==='knowledge_items')return Promise.resolve({data:[seed],error:null}).then(resolve);
  return Promise.resolve({data:[],error:null}).then(resolve);
 }};return q}};
 class AI {responses={create:async args=>{const name=args.text?.format?.name;calls.push(['ai',name??'research']);
  if(name==='editorial_selection')return{output_text:JSON.stringify({candidate_id:seed.id,reason:'別分野'})};
  if(name==='editorial_novelty')return{output_text:JSON.stringify({distinct,reason:'比較結果'})};
  if(name==='opinionated_wordpress_article')return{output_text:JSON.stringify(article)};
  return{output_text:'外部根拠',output:[{type:'message',content:[{type:'output_text',annotations:[{type:'url_citation',url:'https://example.org/source',title:'参考'}]}]}]};
 }}}
 const m=moduleAt('../src/lib/knowledge-automation/wordpressBlog.ts',{
  'server-only':{},openai:{default:AI},'./blogDiversity':policy,'./socialSharing':{socialPublication:()=>({})},
  '@/lib/knowledge/pipeline':{runKnowledgeSource:async()=>{}},'@/lib/openaiProfiles':{OPENAI_PROFILES:{standard:{model:'test'},heavy:{model:'test'}}},
  '@/lib/supabase/service':{supabaseAdmin:db},'@/lib/wordpress/blogPosts':{verifyPublishedBlogPost:async()=>{calls.push(['verify']);if(verifyError)throw Error('verify failed')}},
  '@/lib/wordpress/server':{wordpressFetch:async()=>{if(historyError)throw Error('history unavailable');return{data:history,response:{headers:new Headers({'x-wp-totalpages':'1'})}}},assertWordPressPostDraftAvailable:async()=>{},listWordPressPostCategories:async()=>[],createWordPressPost:async()=>{calls.push(['create']);return{id:1,status:'publish',link:'https://example.org/article'}}},
 });
 return {calls,run:()=>m.createWordPressBlogDraft({id:'task',name:'blog',settings:{allow_external_ai_context:true,wordpress_featured_image:false,wordpress_auto_category:false},approval_mode:'automatic'},'run')};
}
test('history lookup failure stops before AI and publication',async()=>{const h=harness({historyError:true});await assert.rejects(h.run(),/history unavailable|使用済み題材/);assert.equal(h.calls.length,0)});
test('run history errors do not silently become an empty used-source set',async()=>{const h=harness({runError:true});await assert.rejects(h.run(),/history unavailable|使用済み題材/);assert.equal(h.calls.length,0)});
test('failed-run source already in WordPress is excluded before generation',async()=>{const h=harness({history:[{id:5,slug:'smart-ai-20260916-80b2f759',title:{raw:'以前の記事'},content:{raw:'本文'},status:'publish'}]});const r=await h.run();assert.equal(r.status,'skipped');assert.equal(h.calls.length,0)});
test('semantic duplicate is not uploaded or published',async()=>{process.env.OPENAI_API_KEY??='test';const h=harness({distinct:false});const r=await h.run();assert.equal(r.status,'skipped');assert.equal(h.calls.some(c=>c[0]==='create'),false)});
test('publication is recorded before verification fails',async()=>{process.env.OPENAI_API_KEY??='test';const h=harness({verifyError:true});await assert.rejects(h.run(),/verify failed/);const actions=h.calls.filter(c=>['create','record','verify'].includes(c[0]));assert.deepEqual(actions.map(c=>c[0]),['create','record','verify']);assert.equal(actions[1][1].output_summary.sourceId,'80b2f759-aaaa-bbbb-cccc-000000000000');assert.equal(actions[1][1].output_summary.postId,1)});

