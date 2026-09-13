import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
function load(file, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in overrides)) throw Error('Unexpected dependency: ' + name);
    return overrides[name];
  }, module, module.exports);
  return module.exports;
}
const parser = load('../src/lib/agent-playbooks/shiftCancellationParser.ts');
const base = { eventType:'message', channelId:'room', requesterLwUserid:'requester', issuedAt:'2026-09-13T09:21:00Z', hasBotMention:true, mentionedLwUserids:[] };
const application = '@すまーとアイさん\nいつもお世話になります。\n10月利用申込、\n3(土)10:00自宅～おでかけ～16:00自宅\n24(土)10:00自宅～おでかけ～16:00自宅\n調整よろしくお願いします🙏';
function fixture(action) {
  const tables = {
    agent_playbooks:[{id:'book', category:'shift', room_scope:'client_room',trigger_mode:'lineworks_mention',execution_mode:'native_agent',is_enabled:true, allowed_actions:['shift.list', action], context_minutes:30,context_message_limit:10,session_ttl_minutes:7}],
    agent_sessions:[], agent_runs:[], msg_lw_log:[],
    group_lw_channel_view:[{channel_id:'room',group_account:'12345678',group_type:'利用者様情報連携グループ',group_name:'Test'}],
    shift:[{shift_id:1,kaipoke_cs_id:'12345678',shift_start_date:'2026-09-20',shift_start_time:'10:00:00',shift_end_time:'16:00:00',service_code:'test',staff_01_user_id:'staff',required_staff_count:1}],
    user_entry_united_view_single:[{user_id:'staff',lw_userid:'staff-lw',last_name_kanji:'担当',first_name_kanji:'職員',status:'lineworks_kaipoke_joined'}],
    shift_service_code:[{service_code:'test'}], users:[]
  };
  const rpcCalls=[];
  const managerIds=['manager-first','manager-second'];
  let nextId=1;
  const db = {rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:{shift_id:99},error:null};},from(table){
    assert.ok(table in tables, table);
    let filters=[], orders=[], write=null, single=false, limit=Infinity;
    const q={select(){return q;},eq(k,v){filters.push(x=>x[k]===v);return q;},in(k,v){filters.push(x=>v.includes(x[k]));return q;},gte(k,v){filters.push(x=>x[k]>=v);return q;},lte(k,v){filters.push(x=>x[k]<=v);return q;},lt(k,v){filters.push(x=>x[k]<v);return q;},not(k,_op,v){filters.push(x=>x[k]!==v);return q;},order(key, options={}){orders.push([key,options.ascending!==false]);return q;},limit(n){limit=n;return q;},maybeSingle(){single=true;return q;},single(){single=true;return q;},insert(v){write=['insert',v];return q;},update(v){write=['update',v];return q;},then(resolve,reject){try{
      let rows=tables[table].filter(x=>filters.every(f=>f(x)));
      if(write?.[0]==='insert'){rows=[{id:'id'+nextId++,...structuredClone(write[1])}];tables[table].push(...rows);}
      if(write?.[0]==='update') rows.forEach(x=>Object.assign(x,structuredClone(write[1])));
      rows.sort((a,b)=>{for(const [key,asc] of orders){const cmp=a[key]<b[key]?-1:a[key]>b[key]?1:0;if(cmp)return asc?cmp:-cmp;}return 0;});rows=rows.slice(0,limit);return Promise.resolve({data:structuredClone(single?rows[0]??null:rows),error:null}).then(resolve,reject);
    }catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;
  }};
  const overrides={'@/lib/lineworks/resolveClientManagerMentions':{resolveClientManagerMentions:async()=>({managerIds})},'@/lib/supabase/service':{supabaseAdmin:db},'@/lib/lineworks/shiftChangeNotify':{notifyShiftChange:async()=>{}},'@/lib/agent-playbooks/shiftCancellationParser':parser};
  const create=load('../src/lib/agent-playbooks/shiftCreation.ts',overrides);
  const cancel=load('../src/lib/agent-playbooks/shiftCancellation.ts',overrides);
  return {tables,rpcCalls,create,cancel,managerIds};
}
test('提示されたサービス追加依頼は確認を返し、確認前には登録しない',async()=>{
  const f=fixture('shift.create');
  const result=await f.create.handleShiftCreationAgent({...base,message:'@すまーとアイさん\n10/3 10:00〜16:00\nサービス追加して'});
  assert.equal(result.handled,true);assert.match(result.replyText,/2026-10-03/);assert.match(result.replyText,/OK/);
  assert.equal(f.tables.agent_sessions[0].status,'awaiting_confirmation');assert.equal(f.rpcCalls.length,0);
  await f.create.handleShiftCreationAgent({...base,requesterLwUserid:'other',message:'OK',hasBotMention:false});assert.equal(f.rpcCalls.length,0);
  await f.create.handleShiftCreationAgent({...base,message:'OK',hasBotMention:false});assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].name,'shift_insert_with_context');
});
for(const message of ['9/20 シフトキャンセル','9/20 シフト削除して','★にて連絡あり。\n20日の入浴介助キャンセルになりました。\nシフト削除お願いします。']) test(message,async()=>{
  const f=fixture('shift.delete');const result=await f.cancel.handleShiftCancellationAgent({...base,message:'@すまーとアイさん\n'+message});
  assert.equal(result.handled,true);assert.match(result.replyText,/2026-09-20/);assert.match(result.replyText,/OK/);assert.equal(f.rpcCalls.length,0);
  await f.cancel.handleShiftCancellationAgent({...base,requesterLwUserid:'other',message:'OK',hasBotMention:false});assert.equal(f.rpcCalls.length,0);
  await f.cancel.handleShiftCancellationAgent({...base,message:'OK',hasBotMention:false});assert.equal(f.rpcCalls.length,1);assert.equal(f.rpcCalls[0].name,'shifts_delete_with_context');
});
test('メンションなし・無効な設定では新しい会話を開始しない',async()=>{
  for(const action of ['shift.create','shift.delete']){const f=fixture(action);const handler=action==='shift.create'?f.create.handleShiftCreationAgent:f.cancel.handleShiftCancellationAgent;const message=action==='shift.create'?'10/3 サービス追加して':'9/20 シフト削除して';
    assert.equal((await handler({...base,message,hasBotMention:false})).handled,false);
    f.tables.agent_playbooks[0].is_enabled=false;assert.equal((await handler({...base,message})).handled,false);assert.equal(f.tables.agent_sessions.length,0);assert.equal(f.rpcCalls.length,0);
  }
});
test('10月利用申込の2日分を認識し、1日指定を求める',async()=>{
  const f=fixture('shift.create');assert.equal(f.create.containsShiftCreationIntent(application),true);
  assert.deepEqual(parser.parseShiftDateTimeRequests([application],new Date(base.issuedAt)).map(x=>x.date),['2026-10-03','2026-10-24']);
  const result=await f.create.handleShiftCreationAgent({...base,message:application});assert.match(result.replyText,/1日だけ/);assert.equal(f.rpcCalls.length,0);
});
test('期限切れの確認にOKを返しても削除しない',async()=>{
  const f=fixture('shift.delete');await f.cancel.handleShiftCancellationAgent({...base,message:'9/20 シフト削除して'});
  f.tables.agent_sessions[0].expires_at='2000-01-01T00:00:00Z';await f.cancel.handleShiftCancellationAgent({...base,message:'OK',hasBotMention:false});assert.equal(f.rpcCalls.length,0);
});
test('確認後に対象日時が変わった場合は削除しない',async()=>{
  const f=fixture('shift.delete');await f.cancel.handleShiftCancellationAgent({...base,message:'9/20 シフト削除して'});
  f.tables.shift[0].shift_start_time='11:00:00';const result=await f.cancel.handleShiftCancellationAgent({...base,message:'OK',hasBotMention:false});assert.match(result.replyText,/内容が変わった/);assert.equal(f.rpcCalls.length,0);
});

test('受信口から追加・キャンセルへ接続し、実際のメンション形式を渡す',async()=>{
  for(const [content,expectedMention] of [
    [{text:'@すまーとアイさん \n9/20 シフト削除して'},true],
    [{text:'<dm botno="6807751">@すまーとアイさん</dm>\n9/20 シフト削除して'},true],
    [{text:'9/20 シフト削除して',mentions:[{botNo:'6807751'}]},true],
    [{text:'@All 9/20 シフト削除して'},false]
  ]){
    const calls=[];
    const db={from(table){const data=table==='group_lw_channel_info'?{group_id:'group',channel_id:'room'}:table==='groups_lw'?{group_id:'group',group_account:null}:table==='group_lw_channel_view'?{group_type:'利用者様情報連携グループ'}:null;
      const q=new Proxy({}, {get:(_,name)=>name==='then'?(resolve)=>Promise.resolve({data,error:null}).then(resolve):()=>q});return q;
    }};
    const route=load('../src/app/api/webhook/route.ts',{
      '@supabase/supabase-js':{createClient:()=>db},'@/lib/supabase/service':{supabaseAdmin:db},'next/server':{NextResponse:{json:value=>value}},'@/lib/getAccessToken':{getAccessToken:()=>{throw Error('Unexpected send');}},crypto:{},
      '@/lib/agent-playbooks/shiftCreation':{handleShiftCreationAgent:async p=>{calls.push(['create',p]);return {handled:false};}},
      '@/lib/agent-playbooks/shiftCancellation':{handleShiftCancellationAgent:async p=>{calls.push(['delete',p]);return {handled:true};}}
    });
    const result=await route.POST({json:async()=>({type:'message',issuedTime:base.issuedAt,source:{userId:'requester',channelId:'room',domainId:'domain'},content})});
    assert.equal(result.handledBy,'shift-cancellation-agent');assert.deepEqual(calls.map(x=>x[0]),['create','delete']);assert.ok(calls.every(x=>x[1].hasBotMention===expectedMention));
  }
});

const createRequest={...base,message:'10/3 10:00〜16:00 test サービス追加して'};
function proposedStaff(f){return f.tables.agent_sessions[0].pending_action.shift.staffUserIds;}
test('servicesuportと別サービスを飛ばして同サービスの直近担当者を選ぶ',async()=>{
 const f=fixture('shift.create');const old={...f.tables.shift[0]};
 f.tables.shift=[{...old,shift_id:4,shift_start_date:'2026-10-02',staff_01_user_id:'servicesuport'},{...old,shift_id:3,shift_start_date:'2026-10-01',service_code:'other',staff_01_user_id:'other'},{...old,shift_id:2,shift_start_date:'2026-09-30',staff_01_user_id:'recent'},old];
 f.tables.user_entry_united_view_single.push(...['servicesuport','other','recent'].map(user_id=>({user_id,status:'lineworks_kaipoke_joined'})));
 await f.create.handleShiftCreationAgent(createRequest);assert.deepEqual(proposedStaff(f),['recent']);
 await f.create.handleShiftCreationAgent({...base,message:'OK',hasBotMention:false});assert.equal(f.rpcCalls[0].args.p_row.staff_01_user_id,'recent');
});
test('同サービス担当者がいない場合は担当マネジャーの先頭',async()=>{
 const f=fixture('shift.create');f.tables.shift[0].staff_01_user_id='servicesuport';
 const result=await f.create.handleShiftCreationAgent(createRequest);assert.deepEqual(proposedStaff(f),['manager-first']);assert.match(result.replyText,/担当マネジャー一覧の先頭/);
});
test('マネジャーも見つからなければ担当者を確認する',async()=>{
 const f=fixture('shift.create');f.tables.shift=[];f.managerIds.length=0;
 const result=await f.create.handleShiftCreationAgent(createRequest);assert.match(result.replyText,/担当者/);assert.equal(f.tables.agent_sessions[0].status,'awaiting_input');assert.equal(f.rpcCalls.length,0);
});
test('確認待ちの古いservicesuport担当は登録直前に拒否する',async()=>{
 const f=fixture('shift.create');await f.create.handleShiftCreationAgent(createRequest);f.tables.agent_sessions[0].pending_action.shift.staffUserIds=['servicesuport'];
 const result=await f.create.handleShiftCreationAgent({...base,message:'OK',hasBotMention:false});assert.match(result.replyText,/利用できないアカウント/);assert.equal(f.rpcCalls.length,0);
});
test('サービス修正時は自動提案の担当者も選び直す',async()=>{
 const f=fixture('shift.create');f.tables.shift_service_code.push({service_code:'other'});f.tables.shift.push({...f.tables.shift[0],shift_id:2,service_code:'other',staff_01_user_id:'other-staff'});f.tables.user_entry_united_view_single.push({user_id:'other-staff',status:'lineworks_kaipoke_joined'});
 await f.create.handleShiftCreationAgent(createRequest);assert.deepEqual(proposedStaff(f),['staff']);
 await f.create.handleShiftCreationAgent({...base,message:'サービスコードはother',hasBotMention:false});assert.deepEqual(proposedStaff(f),['other-staff']);assert.equal(f.rpcCalls.length,0);
});
