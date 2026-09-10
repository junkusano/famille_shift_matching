const fs=require('fs');const {token}=require('./lineworks.cjs');
const board=JSON.parse(fs.readFileSync('tmp/blog-20260910/lineworks-board.json'));
const post={title:'【インフルエンザ予防】愛知県で早い流行入り／予防接種の前倒しを調査中',body:`<p>職員の皆さんへ</p>
<p>愛知県で、例年より早くインフルエンザが流行入りしています。まだ暑い時期ですが、冬を待たずに予防対策をお願いします。</p>
<p>愛知県では8月24日〜30日の患者報告が定点当たり1.10となり、9月3日に流行入りが発表されました。名古屋市も、同じ週の1.46から、8月31日〜9月6日には2.40へ増加しています。（2026年9月10日確認）</p>
<h2>日々の予防にご協力ください</h2>
<ul><li><strong>マスク：</strong>利用者様と接する場面や混雑した屋内では、マスクの着用を心がけてください。咳・くしゃみがあるときは咳エチケットを徹底し、体調不良のまま無理に勤務しないようお願いします。着用が難しい事情がある場合は個別に相談してください。</li>
<li><strong>手洗い：</strong>外出から戻ったとき、食事の前、ケアの前後など、石けんと流水での手洗いを基本に、職場の感染対策手順を再確認してください。</li>
<li><strong>不要不急の外出：</strong>流行している間は、人混み・繁華街への急がない外出をできるだけ控えてください。必要な受診や生活上の用事は我慢せず、空いている時間帯や場所を選びましょう。</li>
<li><strong>換気・休養：</strong>暑さに配慮しながら換気を行い、十分な睡眠と食事を心がけてください。</li></ul>
<h2>体調に変化があったら、早めに連絡を</h2>
<p>発熱、咳、強いだるさなどがある場合は、無理をせず、早めに担当マネジャー・所属事業所へ連絡してください。利用者様やご家族の体調変化に気づいた場合も、速やかな共有をお願いします。特に高齢者や基礎疾患のある方は、早めに医療機関へ相談することが大切です。</p>
<p>「休むと迷惑がかかる」と一人で抱え込まず、早い段階で相談してください。管理する側も早期の連絡を受け止め、交代に必要な情報や手順を整え、チームで必要なサービスを守りましょう。</p>
<h2>予防接種について</h2>
<p><strong>予防接種は例年10月から開始していますが、今年は流行が早いため、開始時期を前倒しできるか現在調査中です。</strong></p>
<p><strong>追加情報が出ましたら、塩澤里美さんから案内があります。</strong>現時点では、前倒しの可否や具体的な開始日は未定です。今後のお知らせをご確認ください。</p>
<p>利用者様と職員自身の健康、そして日々の支援を守るため、予防と早めの情報共有にご協力をお願いします。</p>
<p>参考：<a href="https://www.pref.aichi.jp/press-release/influenza20260903.html">愛知県・インフルエンザの流行入り</a>／<a href="https://www.city.nagoya.jp/kenkofukushi/eisei/1015269/1015388/1034411/1015408.html">名古屋市・インフルエンザ情報</a>／<a href="https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/kenkou_iryou/kenkou/kekkaku-kansenshou/infulenza/QA2025.html">厚生労働省・予防対策Q&amp;A</a></p>`,enableComment:true,sendNotifications:true};
const target='https://www.worksapis.com/v1.0/boards/'+board.boardId+'/posts';
const parse=s=>JSON.parse(s.replace(/("(?:boardId|postId)"\s*:\s*)(\d+)/g,'$1"$2"'));
(async()=>{fs.writeFileSync('tmp/blog-20260910/lineworks-notice-draft.json',JSON.stringify(post,null,2));if(fs.existsSync('tmp/blog-20260910/lineworks-notice-created.json'))throw Error('Already created; do not duplicate');const t=await token();const headers={Authorization:'Bearer '+t,'Content-Type':'application/json'};const check=await fetch(target+'?count=20',{headers});if(!check.ok)throw Error('Precheck HTTP '+check.status);const list=parse(await check.text());if(list.posts?.some(p=>p.title===post.title))throw Error('Matching post already exists');const r=await fetch(target,{method:'POST',headers,body:JSON.stringify(post),signal:AbortSignal.timeout(60000)});const raw=await r.text();if(!r.ok)throw Error('Create HTTP '+r.status+' '+raw.slice(0,300));const created=parse(raw);fs.writeFileSync('tmp/blog-20260910/lineworks-notice-created.json',JSON.stringify(created,null,2));const vr=await fetch(target+'/'+created.postId,{headers});const verified=parse(await vr.text());if(!vr.ok||verified.title!==post.title||!verified.body.includes('塩澤里美')||!verified.body.includes('調査中'))throw Error('Created, verification failed');console.log(JSON.stringify({boardName:board.boardName,boardId:board.boardId,postId:created.postId,title:verified.title,verified:true}));})().catch(e=>{console.error(e.message);process.exit(1)});
