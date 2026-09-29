const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/automation-module-loader.cjs');
const n = require('../src/lib/knowledge-automation/publicNotices.ts');
const { parseWorksJson } = require('../src/lib/lineworks/board.ts');
const now = new Date('2026-09-16T00:00:00Z');

test('same disturbance keeps its thread when named; other storms use another thread', () => {
  const xml=(event,number='')=>`<Report><Control><Status>通常</Status></Control><Head><EventID>${event}</EventID><ReportDateTime>2026-09-16T08:00:00+09:00</ReportDateTime></Head><Body><MeteorologicalInfo><DateTime type="実況">2026-09-16T06:00:00+09:00</DateTime><TyphoonNamePart><Number>${number}</Number></TyphoonNamePart><CenterPart><Location>日本の南</Location></CenterPart></MeteorologicalInfo></Body></Report>`;
  const url='https://www.data.jma.go.jp/developer/xml/data/test.xml';
  const before=n.parseTyphoonNotice(xml('TC2630'),url,now);
  const after=n.parseTyphoonNotice(xml('TC2630','2625'),url,now);
  assert.equal(before.key,after.key);
  assert.notEqual(before.fingerprint,after.fingerprint);
  assert.match(after.title,/台風25号/);
  assert.notEqual(before.key,n.parseTyphoonNotice(xml('TC2631'),url,now).key);
  assert.equal(n.parseTyphoonNotice(xml('TC2630'),url,new Date('2026-10-01')),null);
});
test('large board and post IDs preserve every digit', () => {
  assert.deepEqual(parseWorksJson('{"boardId":4090000000000291076,"postId":4090000000187141595}'), { boardId: '4090000000000291076', postId: '4090000000187141595' });
});
const entry = (date, text, office = '名古屋地方気象台') => `<entry><id>https://www.data.jma.go.jp/developer/xml/data/a.xml</id><title>大雨警報</title><updated>${date}</updated><author><name>${office}</name></author><content>${text}</content></entry>`;
test('weather: only recent local bulletins; cancellation supersedes earlier alert', () => {
  const old = entry('2026-09-15T20:00:00Z', '愛知県では大雨に警戒してください');
  assert.equal(n.weatherFeedSources(`<feed>${old}</feed>`, now).length, 1);
  assert.equal(n.weatherFeedSources(`<feed>${old}${entry('2026-09-15T21:00:00Z', '愛知県の警報はすべて解除されました')}</feed>`, now).length, 0);
  assert.equal(n.weatherFeedSources(`<feed>${entry('2026-09-01T20:00:00Z','愛知県では大雨に警戒してください')}</feed>`, now).length, 0);
  assert.equal(n.weatherFeedSources(`<feed>${entry('2026-09-15T20:00:00Z','沖縄県で大雨','沖縄気象台')}</feed>`, now).length, 0);
});
test('official URLs reject impersonation and internal endpoints', () => {
  for (const url of ['http://www.pref.aichi.jp/', 'https://www.pref.aichi.jp.evil.test/', 'https://localhost/', 'https://user@www.pref.aichi.jp/']) assert.equal(n.allowedOfficialUrl(url), false);
});
test('police calendar cannot use a previous year or month', () => {
  const base = 'https://www.pref.aichi.jp/police/koutsu/ko-shidou/images/';
  assert.equal(n.currentPoliceCalendarUrl(base+'torishimariyoteiR8.9.pdf',now),true);
  assert.equal(n.currentPoliceCalendarUrl(base+'torishimariyoteiR7.9.pdf',now),false);
  assert.equal(n.currentPoliceCalendarUrl(base+'torishimariyoteiR8.8.pdf',now),false);
});
test('traffic validates exact evidence, date, year and future window', () => {
  const text='2026年9月26日 名古屋市でマラソン交通規制を実施します。';
  const sources=[{url:'https://www.city.nagoya.jp/test.html',text}];
  const item={sourceIndex:0,startDate:'2026-09-26',endDate:'2026-09-26',dateEvidence:text,evidence:text};
  assert.equal(n.validateTrafficItems({items:[item]},sources,now).length,1);
  assert.equal(n.validateTrafficItems({items:[{...item,startDate:'2025-09-26',endDate:'2025-09-26'}]},sources,now).length,0);
  assert.equal(n.validateTrafficItems({items:[{...item,startDate:'2026-09-27',endDate:'2026-09-27'}]},sources,now).length,0);
  assert.throws(()=>n.validateTrafficItems({items:[{...item,evidence:'架空の名古屋市の交通規制が実施されます。'}]},sources,now));
});
test('board refresh retains original operating instructions without repeated append', () => {
  const notice={text:'最新の大雨情報 <script>',sources:[],title:'気象情報'};
  const original='<p>担当マネジャーに相談してください。</p>';
  const once=n.mergeBoardBody(original,notice,now);
  const twice=n.mergeBoardBody(once,notice,now);
  assert.equal(twice,once);
  assert.match(twice,/担当マネジャー/);
  assert.ok(!twice.includes('<script>'));
});
test('verification accepts rendered line breaks but rejects missing text or links', () => {
  const notice={title:'お知らせ',text:'公式情報\n大雨への注意\n\n安全を確認',sources:[{title:'気象庁',url:'https://www.jma.go.jp/'}]};
  const body=n.mergeBoardBody('',notice,now);
  assert.equal(n.boardMatches({title:notice.title,body},notice),true);
  assert.equal(n.boardMatches({title:notice.title,body:body.replace('大雨への注意','')},notice),false);
  assert.equal(n.boardMatches({title:notice.title,body:body.replace('https://www.jma.go.jp/','https://example.com/')},notice),false);
});
test('draft and preview never send or write', async () => {
  assert.equal((await n.deliverNotice({approval_mode:'draft'}, {text:'test'},false)).status,'skipped');
  assert.equal((await n.deliverNotice({approval_mode:'automatic'}, {text:'test'},true)).status,'skipped');
});
test('delivered notices skip, uncertain delivery blocks and read errors fail closed', async () => {
  const {supabaseAdmin:db}=require('../src/lib/supabase/service.ts');
  const original=db.from;
  const task={id:'t',approval_mode:'automatic'};
  const notice={key:'police-2026-09-16',fingerprint:'same'};
  try {
    for(const [reply,expected] of [[{data:{status:'succeeded'},error:null},'skip'],[{data:{status:'needs_review'},error:null},'reject'],[{data:null,error:{message:'offline'}},'reject']]) {
      db.from=()=>{const chain={select:()=>chain,eq:()=>chain,maybeSingle:async()=>reply};return chain;};
      if(expected==='skip')assert.equal((await n.deliverNotice(task,notice)).status,'skipped');
      else await assert.rejects(n.deliverNotice(task,notice));
    }
  }finally{db.from=original;}
});
