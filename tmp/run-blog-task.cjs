const fs=require('fs'),path=require('path'),Module=require('module'),ts=require('typescript');
Object.assign(process.env,require('node:util').parseEnv(fs.readFileSync(path.resolve('.env.local'),'utf8')));
const original=Module._resolveFilename;Module._resolveFilename=function(name,...args){if(name.startsWith('@/'))name=path.resolve('src',name.slice(2));return original.call(this,name,...args)};
const origLoad=Module._load;Module._load=function(name,...args){if(name==='server-only')return {};return origLoad.call(this,name,...args)};
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
(async()=>{
if(process.argv.includes('--resume-prepared')){
 const {supabaseAdmin}=require('../src/lib/supabase/service.ts');
 const {data:previous,error}=await supabaseAdmin.from('knowledge_automation_runs').select('*').eq('id','b911dae5-659c-41ff-921d-4f96589e43c2').single();
 if(error||previous.status!=='failed'||previous.output_summary?.phase!=='prepared')throw Error('Prepared run missing');
 const audit=previous.output_summary;const {getPublishedBlogPost,updatePublishedBlogPost}=require('../src/lib/wordpress/blogPosts.ts');const current=await getPublishedBlogPost(audit.postId);
 if(current.content.raw!==audit.original.content||current.modified_gmt!==audit.original.modified_gmt)throw Error('Article changed');
 require('../src/lib/knowledge-automation/rewritePolicy.ts').validateRewrite(audit.original.content,audit.proposedContent);
 const now=new Date().toISOString();const {data:run,error:insertError}=await supabaseAdmin.from('knowledge_automation_runs').insert({task_id:previous.task_id,status:'running',trigger_source:'retry',idempotency_key:'retry-prepared:'+previous.id,input_summary:{operation:'wordpress_blog_rewrite',retryOf:previous.id},output_summary:audit,output_reference:current.link,started_at:now,claimed_at:now,lease_expires_at:new Date(Date.now()+600000).toISOString()}).select('id').single();if(insertError)throw Error('Retry insert failed');
 try {const saved=await updatePublishedBlogPost(current,audit.proposedContent);const finished=new Date().toISOString();const message='「'+current.title.raw+'」をリライトし、公開記事への反映を確認しました。';const {error:e}=await supabaseAdmin.from('knowledge_automation_runs').update({status:'succeeded',finished_at:finished,lease_expires_at:null,safety_result:'allowed',output_summary:{...audit,phase:'published_verified',message}}).eq('id',run.id);if(e)throw Error('Result persistence failed');await supabaseAdmin.from('knowledge_automation_tasks').update({last_run_at:now,last_success_at:finished,last_result:message,last_error_at:null,last_error_message:null}).eq('id',previous.task_id);console.log(JSON.stringify({status:'succeeded',message,url:saved.link,runId:run.id}));}
 catch(e){await supabaseAdmin.from('knowledge_automation_runs').update({status:'failed',finished_at:new Date().toISOString(),error_message:e.message,lease_expires_at:null}).eq('id',run.id);throw e;}return;
}
if(process.argv.includes('--inspect')){
 const posts=await require('../src/lib/wordpress/blogPosts.ts').listPublishedBlogPosts();const ranked=require('../src/lib/knowledge-automation/rewritePolicy.ts').rankRewriteCandidates(posts,new Map());
 const {supabaseAdmin}=require('../src/lib/supabase/service.ts');const {data,error}=await supabaseAdmin.from('knowledge_sources').select('source_key,enabled,config').eq('source_key','google-analytics-website');
 console.log(JSON.stringify({postCount:posts.length,candidates:ranked.slice(0,5).map(c=>({id:c.post.id,title:c.post.title.raw,url:c.post.link,bytes:c.post.content.raw.length,reasons:c.reasons})),analytics:data?.map(s=>({enabled:s.enabled,propertyConfigured:!!s.config?.propertyId,site:s.config?.siteUrl})),analyticsError:!!error},null,2));return;
}
const result=await require('../src/lib/knowledge-automation/runner.ts').runKnowledgeAutomationTask({taskId:process.argv.includes('--publish-new')?'9eb37fe2-9f82-43ae-9bf7-3059ea8df90c':'0a2b940a-d163-447e-8076-1336a0ccdd93',triggerSource:'manual'});console.log(JSON.stringify(result));
})().catch(e=>{console.error('Task failed: '+(e?.name||'Error'));process.exitCode=1;});
