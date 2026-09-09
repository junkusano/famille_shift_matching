import fs from "node:fs/promises";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const apiBase = (process.env.WORDPRESS_API_URL || "").replace(/\/+$/, "");
const username = process.env.WORDPRESS_USERNAME || "";
const appPassword = process.env.WORDPRESS_APP_PASSWORD || "";

if (!apiBase || !username || !appPassword) {
  throw new Error("WordPress接続設定が不足しています。");
}

const auth = `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
const slug = "minimum-wage-mobility-support-public-price";
const title = "最低賃金は上がる。なぜ移動支援の報酬単価は止まったままなのか";
const excerpt = "愛知県の最低賃金は2026年10月に1,195円へ上がります。一方、名古屋市の移動支援には、長く変わっていない報酬区分があります。賃上げを求めながら公定価格を据え置く矛盾と、必要な仕組みを現場経営の視点から考えます。";
const imagePath = new URL("./assets/minimum-wage-mobility-support-fee.webp", import.meta.url);

const content = `
<p><strong>愛知県の最低賃金は、2026年10月1日から1,195円になります。2020年の927円と比べると、6年間で268円、率にして約29％の上昇です。働く人の生活を守るために賃金を上げる。その方向性に異論はありません。</strong></p>

<p>しかし、訪問介護や障害福祉の経営には大きな矛盾があります。人件費を上げるよう求められる一方で、サービスの売値に当たる公定価格は、同じ速さでは上がらないからです。特に自治体独自事業である移動支援は、国の報酬改定からも外れやすく、物価や賃金の変化から置き去りになりやすい制度です。</p>

<p>ファミーユでも移動支援を数多く提供しています。だからこそ、これは事業者の収益だけの話ではないと感じます。単価の陳腐化を放置した先で失われるのは、障害のある方が出かけ、人と会い、地域で暮らすための選択肢です。</p>

<h2>最低賃金は6年間で約29％上がった</h2>

<p>愛知労働局の公表資料によれば、愛知県の最低賃金は2020年の927円から、2026年には1,195円へ上がります。2026年だけを見ても、前年の1,140円から55円、4.8％の引き上げです。</p>

<p>最低賃金が上がれば、最低賃金に近い職員だけを調整すれば済むわけではありません。経験や役割に応じた賃金差を保つため、既存職員を含めた給与体系全体の見直しが必要になります。さらに事業者が負担する社会保険料も、賃金に連動して増えます。</p>

<p>ファミーユは、制度改定を待つのではなく、DX、シフトの最適化、管理業務の効率化、事業規模の拡大を進め、その成果を処遇へ戻してきました。この5年ほどで、月給は全体として約2万円、時給は約200円引き上げています。それでも、物価と賃金の上昇を会社の努力だけで吸収し続けることには限界があります。</p>

<h2>移動支援の単価は、賃金のようには動いていない</h2>

<p>名古屋市が公開している移動支援の請求コード表を見ると、個別支援は30分2,500円、1時間3,100円、1時間30分3,300円、2時間3,800円などと定められています。</p>

<p>ここで重要なのは、少なくとも公開表で比較できる範囲では、1時間30分以上の多くの時間区分が、平成28年4月提供分と令和2年4月提供分で同額だということです。最低賃金、社会保険料、燃料費、車両費、採用費が上がっても、地域サービスの公定価格は自動的には見直されません。</p>

<p>「以前に改定した」という事実だけでは、現在の単価が妥当である根拠にはなりません。改定後に人件費や物価がどれだけ変化したのか、その単価で地域の供給を維持できているのかまで検証する必要があります。</p>

<h2>サービス単価は、ヘルパーの時給ではない</h2>

<p>移動支援の単価を見て、「1時間3,100円なら、時給1,195円を十分に払える」と考えるのは実態に合いません。3,100円はヘルパーへそのまま渡せる金額ではなく、事業運営に必要な費用をすべて含んだ売上です。</p>

<p>支援の前後には、利用者様宅までの移動、予定の調整、記録、請求、研修、採用、急なキャンセルへの対応があります。支援と支援の間に空き時間が生じることもあります。そこに管理者やサービス提供責任者の人件費、社会保険料、交通費、保険、システム費用などが重なります。</p>

<p>特に移動を伴うサービスでは、「利用者様と一緒にいる時間」だけで採算を測れません。見えにくい周辺時間と固定費を誰が負担するのかまで考えなければ、表面上の単価だけが残り、実際に担う事業者が減っていきます。</p>

<h2>賃上げを求めながら、売値を固定する矛盾</h2>

<p>一般の事業であれば、人件費や仕入価格が上がったとき、効率化を進めながら販売価格も見直します。しかし、公定価格の事業者は自分で値上げできません。行政が賃上げを進める一方、その行政が決めるサービス価格を長期間据え置けば、政策同士が矛盾します。</p>

<p>もちろん、事業者側の改善努力は必要です。紙や転記を減らす、移動距離を短くする、シフトを組み直す、管理業務を自動化する。ファミーユも、そこから逃げずに取り組んできました。</p>

<p>ただし、DXは制度の価格不足を永久に埋める魔法ではありません。生産性向上で生まれた余力は、本来、職員の処遇改善、支援の質、新しい受入れへ戻すべきものです。公定価格の遅れを埋めるためだけに消えてしまえば、改善を重ねる事業者ほど報われない構造になります。</p>

<h2>最後に狭くなるのは、障害のある方の外出の自由</h2>

<p>名古屋市が公表している障害福祉に関するニーズ調査には、移動支援の単価を上げ、従事者が集まるようにしてほしいという意見や、ヘルパー不足で契約を継続できないという声が掲載されています。</p>

<p>低い単価の影響は、最初は事業所の採用難や赤字として現れます。しかし、最終的には「頼んでも人がいない」「使いたい日に使えない」「新規契約を受けてもらえない」という形で、利用者様へ返っていきます。</p>

<p>移動支援は単なる外出の付き添いではありません。買い物、余暇、地域活動、人とのつながりなど、地域で暮らすための社会参加を支えるサービスです。供給不足を放置することは、制度上は認められている外出の機会を、実質的に狭めることにつながります。</p>

<h2>自治体独自事業にも「自動スライド」の仕組みを</h2>

<p>必要なのは、声が大きくなったときだけ単発で値上げすることではありません。最低賃金や物価が変われば、公定価格も一定のルールで見直される仕組みです。</p>

<ul>
  <li><strong>最低賃金、消費者物価、事業主の社会保険負担を基準に、毎年単価を検証する</strong></li>
  <li><strong>最低賃金の改定時期と、サービス単価の反映時期をできる限りそろえる</strong></li>
  <li><strong>算定根拠と、据え置く場合の理由を公開する</strong></li>
  <li><strong>支援時間だけでなく、移動・記録・調整など地域サービスに不可欠なコストを反映する</strong></li>
</ul>

<p>国の障害福祉サービス報酬だけを見ていても、自治体独自事業の陳腐化は見つかりません。自治体には、地域の最低賃金や採用市場と照らし合わせ、実際にサービスを提供できる価格かどうかを継続的に確認する責任があります。</p>

<h2>会社の努力と、制度が直すべき問題を混同しない</h2>

<p>私たちはこれからも、業務を効率化し、働き方を改善し、その成果を職員へ還元します。それは事業者が果たすべき役割です。</p>

<p>一方で、最低賃金を上げながら、行政が決めるサービス単価を長く固定する問題は、個社の努力だけで解決するものではありません。会社が工夫すべき領域と、制度が修正すべき領域を分けて議論する必要があります。</p>

<p>賃上げと福祉サービスの持続可能性は、どちらかを諦める話ではありません。働く人の生活を守りながら、障害のある方の外出の自由も守る。その両方を実現するために、公定価格を社会の変化へ連動させる。いま必要なのは、その当たり前の仕組みだと考えています。</p>

<h2>外部参考情報</h2>
<ul>
  <li><a href="https://jsite.mhlw.go.jp/aichi-roudoukyoku/jirei_toukei/chingin_kanairoudou/saiteichingin_toukei/saiteichingin.html" target="_blank" rel="noopener noreferrer">愛知労働局「愛知県最低賃金」</a></li>
  <li><a href="https://jsite.mhlw.go.jp/aichi-roudoukyoku/jirei_toukei/chingin_kanairoudou/saiteichingin_toukei/saitin04.html" target="_blank" rel="noopener noreferrer">愛知労働局「愛知県最低賃金の推移」</a></li>
  <li><a href="https://www.kaigo-wel.city.nagoya.jp/_files/00073448/idoucodeR204.pdf" target="_blank" rel="noopener noreferrer">名古屋市「移動支援事業 請求コード表」</a></li>
  <li><a href="https://www.kaigo-wel.city.nagoya.jp/_files/00144650/R6needssurvey.pdf" target="_blank" rel="noopener noreferrer">名古屋市「障害福祉に関するニーズ調査」</a></li>
  <li><a href="https://www.kaigo-wel.city.nagoya.jp/view/wel/service/living/" target="_blank" rel="noopener noreferrer">ウェルネットなごや「地域生活の支援」</a></li>
</ul>
`;

async function wordpress(path, options = {}) {
  const response = await fetch(`${apiBase}/${path}`, {
    ...options,
    headers: {
      Authorization: auth,
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!response.ok) {
    throw new Error(`WordPress API ${response.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

const existing = await wordpress(`posts?context=edit&slug=${encodeURIComponent(slug)}&status=any&per_page=100&_fields=id,slug,status,link,featured_media`);
const existingPost = Array.isArray(existing) ? existing[0] : null;
let featuredMediaId = Number(existingPost?.featured_media) || 0;

if (!featuredMediaId) {
  const imageBytes = await fs.readFile(imagePath);
  const media = await wordpress("media?context=edit", {
    method: "POST",
    headers: {
      "Content-Type": "image/webp",
      "Content-Disposition": 'attachment; filename="minimum-wage-mobility-support-fee.webp"',
    },
    body: imageBytes,
  });
  featuredMediaId = Number(media.id);

  await wordpress(`media/${featuredMediaId}?context=edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alt_text: "最低賃金が上昇する一方で移動支援の公定価格が据え置かれている状況を表すイメージ",
      caption: "賃金の上昇と、地域の外出支援を支える公定価格のずれ",
    }),
  });
}

const post = await wordpress(existingPost ? `posts/${existingPost.id}?context=edit` : "posts?context=edit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title,
    slug,
    content,
    excerpt,
    status: existingPost?.status || "draft",
    featured_media: featuredMediaId,
    categories: [24, 25],
  }),
});

console.log(JSON.stringify({
  ok: true,
  postId: post.id,
  status: post.status,
  title: post.title?.raw || post.title?.rendered || title,
  link: post.link,
  featuredMediaId,
  categories: post.categories,
}, null, 2));
