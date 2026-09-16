const fs=require('fs');
const {token}=require('./blog-20260910/lineworks.cjs');
const parse=s=>JSON.parse(s.replace(/("(?:boardId|postId)"\s*:\s*)(\d+)/g,'$1"$2"'));
const post={title:'【重要】アジア大会の交通規制／訪問ルート確認と事前調整のお願い',body:`<p>ファミーユの皆さま</p>
<p>愛知・名古屋アジア大会に伴い、交通規制や周辺道路の混雑が予想されます。訪問介護・送迎・移動支援の予定がある方は、<strong>訪問先までの経路と、次の訪問先への移動経路を事前に確認</strong>してください。</p>
<h2>特に注意が必要な日（2026年）</h2>
<ul><li><strong>9/16（水）：</strong>瑞穂区で聖火リレーに伴う交通規制。直近のため、該当する方は早めに経路を確認してください。</li>
<li><strong>9/19（土）・20（日）：</strong>高速道路や名古屋駅周辺などで交通規制。19日は開会式に伴い瑞穂公園周辺でも通行止め・駐停車禁止があります。</li>
<li><strong>9/23（水・祝）4:30～11:00頃：</strong>競歩に伴い、愛知県庁・名古屋市役所周辺で車両通行止め。</li>
<li><strong>9/26（土）6:45～11:20頃：</strong>マラソンに伴う広範囲の交通規制。瑞穂公園から御器所・内山町・桜通大津・名城公園方面のコース沿線に影響します。名古屋高速の春岡出口も6:40～11:05頃に閉鎖予定です。</li>
<li><strong>9/27（日）4:30～13:00頃：</strong>競歩に伴い、愛知県庁・名古屋市役所周辺で車両通行止め。</li>
<li><strong>10/4（日）：</strong>閉会式に伴い、瑞穂公園周辺で通行止め・駐停車禁止があります。</li></ul>
<p>開閉会式当日は、瑞穂野球場西・瑞穂公園・瑞穂競技場前・山下通・田辺通4付近の規制にも注意してください。</p>
<h2>訪問・送迎を担当する皆さまへのお願い</h2>
<ol><li><strong>移動ルートを確認してください。</strong>規制区間を通過・横断する予定がないか確認し、迂回と渋滞を考慮して移動時間に余裕を持たせてください。駐車場所・乗降場所も確認をお願いします。</li>
<li><strong>難しい訪問先は、事前に調整をお願いします。</strong>時間どおりの到着が難しい、出入りが難しくなる、次の訪問に間に合わないなどの見込みがある場合は、当日まで待たず、早めに担当マネジャー・サービス提供責任者へ相談してください。対象日時・訪問先・困る点を伝え、訪問時間・訪問順・担当者・送迎経路などを事前に調整しましょう。</li>
<li><strong>特に9/26（土）の朝の訪問を優先確認してください。</strong>マラソンは広い範囲に影響するため、訪問先の周辺だけでなく、訪問先同士を結ぶ経路も確認してください。</li>
<li><strong>調整する側も、早めの共有と確認をお願いします。</strong>必要な変更は利用者様・ご家族等と事前に相談し、決定内容を関係する担当者へ共有してください。一人で抱え込まず、チームで必要なサービスを継続できるよう準備しましょう。</li>
<li><strong>公共交通機関の運行も確認してください。</strong>市バスは運休・経路変更の可能性があります。移動支援では往路・復路の両方を確認してください。</li></ol>
<p>規制時間は目安で、場所や当日の状況により変わります。ほかの競技・行事による規制もあるため、移動前には最新の公式情報・規制図を確認してください。</p>
<h2>公式情報（2026年9月15日確認）</h2>
<ul><li><a href="https://www.city.nagoya.jp/aichi-nagoya2026/1040799/1040041.html">名古屋市：交通規制情報</a></li>
<li><a href="https://www.city.nagoya.jp/shisei/kouhou/1017531/1017619/1017620/1041929.html">名古屋市：主な規制日時・区間</a></li>
<li><a href="https://www.city.nagoya.jp/aichi-nagoya2026/1040803/1000312.html">名古屋市：聖火リレー・瑞穂区の規制図</a></li>
<li><a href="https://www.aichi-nagoya2026.org/ja/transport-information/">大会公式：交通情報</a></li></ul>
<p>利用者様と職員の安全、日々のサービスを守るため、早めの確認と調整にご協力をお願いします。</p>`,enableComment:true,sendNotifications:true};
(async()=>{const resultPath='tmp/asia-traffic-created.json';fs.writeFileSync('tmp/asia-traffic-draft.json',JSON.stringify(post,null,2));const t=await token();const headers={Authorization:'Bearer '+t,'Content-Type':'application/json'};const br=await fetch('https://www.worksapis.com/v1.0/boards?role=WRITER',{headers});if(!br.ok)throw Error('Board HTTP '+br.status);const b=parse(await br.text()).boards.find(x=>x.boardName==='お知らせ');if(!b)throw Error('Board missing');const target='https://www.worksapis.com/v1.0/boards/'+b.boardId+'/posts';const lr=await fetch(target+'?count=20',{headers});if(!lr.ok)throw Error('List HTTP '+lr.status);const list=parse(await lr.text());let created=list.posts?.find(x=>x.title===post.title);if(!created){if(fs.existsSync(resultPath))throw Error('Prior creation recorded; inspect before retry');const r=await fetch(target,{method:'POST',headers,body:JSON.stringify(post),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Create HTTP '+r.status);created=parse(await r.text());fs.writeFileSync(resultPath,JSON.stringify({boardId:b.boardId,...created},null,2));}const vr=await fetch(target+'/'+created.postId,{headers});if(!vr.ok)throw Error('Verify HTTP '+vr.status);const v=parse(await vr.text());if(v.title!==post.title||v.body!==post.body)throw Error('Readback differs; inspect');console.log(JSON.stringify({boardName:b.boardName,boardId:b.boardId,postId:created.postId,title:v.title,verified:true}));})().catch(e=>{console.error(e.message);process.exit(1)});

