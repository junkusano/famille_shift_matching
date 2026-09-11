import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function setup(groupType, options = {}) {
  const requests = [];
  let tokenCalls = 0;
  const db = { from(table) { const q = {
    select() { return q; }, or() { return q; }, eq() { return q; },
    async maybeSingle() {
      if (table === 'group_lw_channel_info') return { data: options.fallback ? null : {group_id:'group'}, error:null };
      if (options.lookupError) return {data:null,error:{message:'unavailable'}};
      return {data:{group_id:'group',group_type:groupType},error:null};
    }
  }; return q; }};
  const context = vm.createContext({exports:{}, console:{warn(){}}, Set,
    require(name) { return name.includes('supabase') ? {supabaseAdmin:db} : {resolveClientManagerMentions:async()=>({mentions:[]})}; },
    async fetch(url, init) {
      requests.push({url,...init});
      const fail = requests.length === 1 && !options.success;
      return {ok:!fail,status:fail?400:200,text:async()=> 'invalid mention'};
    }
  });
  vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/lib/lineworks/sendLWBotMentionMessage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  return {requests, get tokenCalls(){return tokenCalls;}, async run(){
    await context.exports.sendLWBotMentionMessage({botId:'bot',channelId:'52e31296-6764-0a1e-5b37-11023360216b',accessToken:'test',getGroupAccessToken:async()=>{tokenCalls++;return 'group-test';},mentions:[{userId:'user',label:'対象者'}],buildText:(active,notes)=>JSON.stringify({active,notes})});
  }};
}
for (const type of ['人事労務サポートルーム','その他',null,undefined]) {
 test(`自動追加禁止: ${type}`,async()=>{const s=setup(type);await s.run();assert.equal(s.requests.filter(r=>r.url.endsWith('/members')).length,0);assert.equal(s.tokenCalls,0);assert.equal(s.requests.length,2);assert.equal(JSON.parse(JSON.parse(s.requests[1].body).content.text).active.length,0);});
}
test('利用者情報グループのみ追加して再送',async()=>{const s=setup('利用者様情報連携グループ');await s.run();assert.equal(s.requests[1].url.endsWith('/members'),true);assert.equal(s.tokenCalls,1);assert.equal(s.requests.length,3);});
test('グループIDの代替検索でも種別確認',async()=>{const s=setup('その他',{fallback:true});await s.run();assert.equal(s.tokenCalls,0);assert.equal(s.requests.length,2);});
test('種別取得失敗なら追加しない',async()=>{const s=setup(null,{lookupError:true});await s.run();assert.equal(s.tokenCalls,0);assert.equal(s.requests.length,2);});
test('初回成功なら追加しない',async()=>{const s=setup('利用者様情報連携グループ',{success:true});await s.run();assert.equal(s.requests.length,1);assert.equal(s.tokenCalls,0);});
test('旧送信関数のメンションも共通処理へ渡し、副チャンネルを正規化する',async()=>{
  let received;
  const context=vm.createContext({exports:{},console,require(name){
    if(name.includes('supabase'))return {supabaseAdmin:{from(){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:{channel_id:'primary'},error:null};}};return q;}}};
    return {sendLWBotMentionMessage:async(args)=>{received=args;},buildRecoveredMentionText:()=> 'recovered'};
  },fetch(){throw new Error('共通処理を迂回しました');}});
  vm.runInContext(ts.transpileModule(readFileSync(new URL('../src/lib/lineworks/sendLWBotMessage.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.equal(await context.exports.sendLWBotMessage('secondary','<m userId="user">さん','test'),true);
  assert.equal(received.channelId,'primary');
  assert.equal(received.mentions[0].userId,'user');
  assert.equal(received.buildText([],[]),'recovered');
});
