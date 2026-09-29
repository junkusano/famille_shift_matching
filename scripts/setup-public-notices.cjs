// Register only the three notices requested on 2026-09-16. No credentials in output.
require('./automation-module-loader.cjs');
const fs = require('node:fs');
const {supabaseAdmin: db} = require('../src/lib/supabase/service.ts');
const {AUTOMATION_TEMPLATES} = require('../src/lib/knowledge-automation/catalog.ts');
const {knowledgeAutomationTaskInputSchema: schema} = require('../src/lib/knowledge-automation/validation.ts');
const {calculateAutomationNextRunAt: nextRun} = require('../src/lib/knowledge-automation/scheduling.ts');
async function main() {
  const enable = process.argv.includes('--enable');
  const current = await db.from('knowledge_automation_tasks').select('*');
  if (current.error) throw Error('Tasks unavailable');
  fs.mkdirSync('tmp', {recursive:true});
  const backup='tmp/public-notices-tasks-before.json';
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(current.data,null,2));
  const weather = current.data.filter(t=>t.task_type==='weather_alert');
  if (weather.length!==1) throw Error('Weather task is ambiguous');
  const configurations=[
    {...weather[0],schedule:{minutes:30},description:'気象庁Atomと愛知県の天気概況から台風・大雨・大雪・暴風・浸水等を確認し、お知らせ掲示板に案件ごとの記事を作成し、同じ案件の続報は更新します。',condition_summary:'愛知県・東海地方の公式発表に台風・大雨・大雪・暴風・浸水等の注意情報がある場合。別の台風・気象案件は新規記事、同じ案件の続報は更新。同一内容は重複投稿しない。',
      settings:{...weather[0].settings,lineworksBoardId:'4090000000000291076',existingPosts:{}}},
    ...['traffic-restrictions','police-enforcement'].map(key=>{
      const input=AUTOMATION_TEMPLATES.find(t=>t.key===key).input;
      const matches=current.data.filter(t=>t.settings.operation===input.settings.operation);
      if(matches.length>1)throw Error('Duplicate task operation');
      return {...input,id:matches[0]?.id,settings:{...input.settings,...matches[0]?.settings,
        ...(key==='traffic-restrictions'?{lineworksBoardId:'4090000000000291076',existingPosts:{'asian-games-2026':'4090000000187744779'}}:{})}};
    }),
  ];
  for(const config of configurations){
    const input=schema.parse({...config,is_enabled:enable,approval_mode:'automatic'});
    const row={...input,next_run_at:nextRun(input.trigger_type,input.schedule,enable)};
    const result=config.id?await db.from('knowledge_automation_tasks').update(row).eq('id',config.id).select('id,name,is_enabled,next_run_at').single():await db.from('knowledge_automation_tasks').insert(row).select('id,name,is_enabled,next_run_at').single();
    if(result.error)throw Error(result.error.message);
    console.log(JSON.stringify(result.data));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
