import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const task={task_type:'other',name:'週末イベント',destination:'lineworks_message',settings:{operation:'event_digest'}};
async function run(text){
  const sent=[];
  const overrides={
    'server-only':{},
    openai:{default:class {responses={create:async()=>({output_text:text})};}},
    '@/lib/getAccessToken':{getAccessToken:async()=>'test-token'},
    '@/lib/lineworks/sendLWBotMessage':{sendLWBotMessage:async(...args)=>sent.push(args)}
  };
  const code=ts.transpileModule(fs.readFileSync(new URL('../src/lib/knowledge-automation/externalInformation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  new Function('require','module','exports',code)(name=>{assert.ok(name in overrides,name);return overrides[name];},module,module.exports);
  const previous=global.fetch;global.fetch=async()=>new Response('公式情報');
  try{return {result:await module.exports.runExternalInformationAutomation(task),sent};}
  catch(error){return {error,sent};}
  finally{global.fetch=previous;}
}
const official='https://nagoyachaya.aeonmall.jp/event/';
for(const [name,text,pattern] of [
  ['市内開催の記載がない',`無料 ${official}`,/名古屋市内/],
  ['対象地域外を含む',`名古屋市と東京都 ${official}`,/名古屋市外/],
  ['料金等が未確認',`名古屋市 詳細は公式サイトをご確認ください ${official}`,/料金またはバリアフリー/],
  ['公式以外のURL',`名古屋市 https://example.org/event/`,/公式サイト以外/],
  ['根拠URLなし','名古屋市のイベント',/根拠URL/]
])test(name+'場合は送信しない',async()=>{const r=await run(text);assert.match(r.error?.message??'',pattern);assert.equal(r.sent.length,0);});
test('すべてのチェックを通った案内は一度送信する',async()=>{const text=`名古屋市港区 無料 車いす利用可 ${official}`;const r=await run(text);assert.ifError(r.error);assert.equal(r.result.status,'succeeded');assert.equal(r.sent.length,1);assert.equal(r.sent[0][1],text);});
