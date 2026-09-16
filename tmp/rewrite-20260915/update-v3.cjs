const fs=require('fs');require('@next/env').loadEnvConfig(process.cwd());
const dir='tmp/rewrite-20260915';const before=JSON.parse(fs.readFileSync(dir+'/after-v2.json','utf8'));
let content=before.content.raw;
const anchor='<h2>車内の時間を、自分で使えるようになる</h2>';
const premise=`<h2>自動運転の未来には、いくつかの形がある</h2>
<p>車を所有せず、必要なときに移動サービスを使う未来は、有力な方向の一つです。Waymoは実際に自動運転の配車サービスを展開し、車を所有しない人にも移動を提供する方針を示しています。OECDの国際交通フォーラムも、自家用車での移動を共有車両へ置き換える都市のあり方を研究してきました。<a href="https://www.waymo.com/sustainability/" target="_blank" rel="noopener noreferrer">〔Waymo〕</a> <a href="https://www.itf-oecd.org/itf-work-shared-mobility-0" target="_blank" rel="noopener noreferrer">〔ITFの研究〕</a></p>
<p>同時に、別の形も考えられています。自動運転する車を個人が所有する形、駅まで自動運転車を使い、その先は鉄道を使う形、会社や地域で車を共有する形です。Waymoとトヨタも、個人所有車への技術活用を検討しています。自動運転の普及とともに、地域や用途に合った使い方が共存していくと考えるのが自然でしょう。<a href="https://waymo.com/blog/2025/04/waymo-and-toyota-outline-strategic-partnership/" target="_blank" rel="noopener noreferrer">〔Waymo・トヨタの発表〕</a></p>
<p>ですから、ここでの前提は「誰もが車を持たなくなる」という断定ではありません。<strong>車を所有しなくても必要な移動を確保できる選択肢が広がり、人が運転に使っていた時間を別のことに使えるようになる。</strong>その変化を、ファミーユの仕事にどう取り込むかを考えています。</p>
<p>カレンダーとの連動は、その移動サービスを使いやすくする仕組みです。予定から迎えの時刻や行き先を組み立てることは合理的ですが、予定が分かることと、必要な車を確保して時間どおりに運べることは、別々に実現する必要があります。また、無人化によるコスト削減が、そのまま利用料金の大幅な値下げになるとは限りません。現状のWaymoも需要などに応じた料金設定です。低価格で安定して使えるかは、導入時に確認すべき条件です。<a href="https://support.google.com/waymo/answer/9059184?hl=en" target="_blank" rel="noopener noreferrer">〔Waymoの料金説明〕</a></p>
`;
if(!content.includes(anchor))throw Error('Missing premise anchor');content=content.replace(anchor,premise+anchor);
const start=content.indexOf('<h2>予定表と連動し、十分に安くなるなら、速やかに切り替える</h2>');const end=content.indexOf('<h2>マネジャーなら、管理・間接業務を車内で進められる</h2>');if(start<0||end<start)throw Error('Missing operation section');
content=content.slice(0,start)+`<h2>ファミーユが考える、訪問介護と自動運転の組み合わせ</h2>
<p>ファミーユが考えたいのは、<strong>訪問予定に合わせて車が手配され、職員は次の利用者宅へ移動しながら、役割に合った仕事を進められる運用</strong>です。これは今後の構想であり、導入済みの仕組みではありません。</p>
<p>例えば、10時にAさん宅でサービスが終わり、10時30分からBさん宅で次のサービスがある。予定表から必要な移動を把握して、終了時刻に合わせて車を手配する。職員が乗車したら、到着までに使える時間に応じて、記録の確認や次の訪問への申し送りを進める。サービスが延びた場合は、次の訪問時刻への影響を確認し、配車と訪問先への連絡を調整する。こうした一連の流れを想定しています。</p>
<p>移動手段は、外部の自動運転タクシーを利用する形が一つの候補です。地域で利用できるサービスや費用によっては、会社で自動運転車を保有・契約し、職員間で共有する形も比較対象になります。世の中から自家用車がなくなるのを待つ必要はありません。自社の訪問エリアで、運転を任せられる条件が整えば検討できます。</p>
<p>現状のタクシーよりずっと安価で、必要な地域と時間帯に安定して使えるなら、速やかに代替を進めたいと考えます。その判断では、運賃だけでなく、現在の車両保有・維持費、配車待ち、実際に車内で進められる業務も含めて比較します。</p>
<p>そして、配車の導入と同時に、誰が車内で何をするのかを決めます。運転から解放される時間を、現場の仕事が進む時間へ変えるためです。</p>
`+content.slice(end);
const last='<h2>車が迎えに来る未来に、仕事の設計を間に合わせる</h2>';
content=content.replace(last,`<h2>実現までに確かめたい、四つの課題</h2>
<ul>
<li><strong>訪問時刻を守れるか。</strong>必要な場所と時間帯で車を確保できるか、サービスの延長や急な予定変更に対応できるか。配車できないときの代替手段まで用意する必要があります。</li>
<li><strong>一日の運用全体で費用が見合うか。</strong>無人だから安いと決めつけず、実際の運賃や契約料金、繁忙時間帯の変動、車両を持つ場合の費用を比べます。車内の業務効果も、実際に進んだ仕事で確認します。</li>
<li><strong>車内で無理なく仕事ができるか。</strong>短い移動でも扱える作業、通信環境、車酔いなどの個人差を踏まえる必要があります。利用者情報を扱う画面や通話は周囲に漏れないようにし、休憩として確保する時間は別に設けます。</li>
<li><strong>業務の価値を公平に評価できるか。</strong>移動の長さ・頻度に加え、割り当てた仕事と実施内容を把握します。手順書更新の件数だけでなく、次の支援に役立ったかまで見る方法を具体化する必要があります。</li>
</ul>
<p>これらは導入を進めるために解くべき課題です。使える地域や業務で実際の待ち時間、費用、作業の進み方を確かめ、運用を調整しながら広げていくことを考えています。</p>
`+last);
const title='予定を入れれば、車が迎えに来る。ファミーユが考える訪問介護と自動運転';
const excerpt='名古屋でも始まった自動運転の実証。車を持たず、予定に合わせて移動できる未来を、ファミーユは訪問介護にどう生かすか。複数の未来像を踏まえ、予定表連動の配車、車内での業務、費用と公平な評価の課題を考えます。';
const payload={title,content,excerpt};fs.writeFileSync(dir+'/rewrite-v3.json',JSON.stringify(payload,null,2));
const base=new URL(process.env.WORDPRESS_API_URL).origin;if(base!=='https://www.shi-on.net'||before.id!==1988)throw Error('Unexpected target');const auth='Basic '+Buffer.from(process.env.WORDPRESS_USERNAME+':'+process.env.WORDPRESS_APP_PASSWORD).toString('base64');
async function api(body){const r=await fetch(base+'/wp-json/wp/v2/posts/1988'+(body?'':'?context=edit'),{method:body?'POST':'GET',headers:{Authorization:auth,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
(async()=>{const current=await api();if(current.modified_gmt!==before.modified_gmt||current.content.raw!==before.content.raw)throw Error('Concurrent change');fs.writeFileSync(dir+'/before-v3.json',JSON.stringify(current,null,2));await api(payload);const after=await api();fs.writeFileSync(dir+'/after-v3.json',JSON.stringify(after,null,2));if(after.content.raw.trim()!==content.trim()||after.title.raw!==title||after.excerpt.raw.trim()!==excerpt||after.status!=='publish'||after.slug!==before.slug)throw Error('Save verification failed');const r=await fetch(after.link,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});const html=await r.text();fs.writeFileSync(dir+'/public-v3.html',html);const ok=r.status===200&&[title,'名古屋でも、自動運転車の実証運行が始まりました','自動運転の未来には、いくつかの形がある','実現までに確かめたい、四つの課題'].every(s=>html.includes(s));console.log(JSON.stringify({id:after.id,link:after.link,verified:ok}));if(!ok)throw Error('Public verification failed');})().catch(e=>{console.error(e.message);process.exit(1)});
