import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require('typescript');
function run(file,globals){const c=vm.createContext({exports:{},Date,URL,Error,console,process:{env:{}},...globals});const s=fs.readFileSync(file,'utf8').replace(/^import .*;\r?\n/gm,'');vm.runInContext(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;}
test('SharefullのRPA障害だけが追加個別通知へ進み、他のRPA通知先は維持する',async()=>{
 const copies=[],channels=[];
 const db={from(){const q={select:()=>q,eq:()=>q,is:()=>q,gte:()=>q,limit:()=>q,insert:()=>q,update:()=>q,maybeSingle:async()=>({data:null}),single:async()=>({data:{id:'alert-1'}}),then:(r,j)=>Promise.resolve({error:null}).then(r,j)};return q;}};
 const module=run('src/lib/rpa-runner/alerts.ts',{createHash,supabaseAdmin:db,sharefullRpaMode:()=> 'production',getAccessToken:async()=> 'opaque',sendLWBotMessage:async(...a)=>channels.push(a),sendSpotNotification:async(input)=>copies.push(input)});
 const alert={jobId:'job',runnerId:'runner',runnerName:'Runner',jobType:'sharefull.create_spot_offer',errorCode:'FAILED',errorCategory:'CONFIG',errorMessage:'configuration missing',retryCount:0};
 await module.notifyRpaJobFailure(alert);assert.equal(copies.length,1);assert.equal(copies[0].topic,'sharefull_runner_failure');assert.equal(copies[0].key,'alert-1');assert.equal(copies[0].isTest,false);
 await module.notifyRpaJobFailure({...alert,jobType:'other.job'});assert.equal(copies.length,1);assert.equal(channels.length,1);
});
test('テンプレート審査待ち通知は保存済みIDを検証してから個別送信経路へ進む',async()=>{
 const copies=[];
 const db={from(table){const q={select:()=>q,eq:()=>q,insert:()=>q,update:()=>q,maybeSingle:async()=>({data:{core_id:'core',kaipoke_cs_id:'scope',sharefull_template_id:'123456'}}),then:(r,j)=>Promise.resolve({error:null}).then(r,j)};return q;}};
 const module=run('src/app/api/rpa/sharefull/template-review-notification/route.ts',{NextResponse:{json:(body,init)=>({body,...init})},requireTaimeeRpaOperator:async()=>{},isRpaTaimeeError:()=>false,supabaseAdmin:db,isSharefullSyncClient:()=>true,sharefullTemplateTableName:()=> 'templates',sharefullRpaMode:()=> 'production',getAccessToken:async()=> 'opaque',sendLWBotMessage:async()=>{},sendSpotNotification:async(input)=>copies.push(input)});
 const response=await module.POST({json:async()=>({core_id:'core',template_id:'123456',template_name:'Template',template_url:'https://client.sharefull.com/order_template/123456'})});
 assert.equal(response.body.ok,true);assert.equal(copies.length,1);assert.equal(copies[0].topic,'sharefull_template_review');assert.equal(copies[0].key,'123456');
});
