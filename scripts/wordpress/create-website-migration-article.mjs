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
const slug = "leadgrid-to-wordpress-knowledge-publishing";
const title = "LeadGridからWordPressへ。採用を支えたホームページを「知識が動く発信基盤」に変えた理由";
const excerpt = "採用難を突破するために導入し、実際に成果を出したLeadGridから、なぜ今WordPressへ移行したのか。自社の採用導線とAI活用が成長したことで、ホームページに求める役割と基盤の選定軸が変わりました。";
const imagePath = new URL("./assets/website-migration-knowledge-publishing.webp", import.meta.url);

const content = `
<p><strong>ファミーユのホームページを、外部会社が提供するLeadGridからWordPressへ移行しました。これはLeadGridが役に立たなかったからではありません。採用難という当時の最大課題に対して十分な成果を出したうえで、ファミーユ自身の仕組みとAI活用が成長し、ホームページに求める役割が変わったためです。</strong></p>

<p>今回の移行によって、外部ニュースや公式発表、社内で生まれた改善の知見、そして私自身が日々更新している草野ナレッジを結びつけ、記事の下書き作成からアイキャッチ、カテゴリ整理までを自動化・半自動化できるようになりました。これはホームページの引っ越しではなく、会社が持つ知識を外へ届ける仕組みの作り直しです。</p>

<h2>LeadGridは、採用難を突破するための投資だった</h2>

<p>LeadGridを導入した2024年9月頃、ファミーユの大きな経営課題は採用難でした。私自身、社内の業務改善や仕組みづくりには取り組んできましたが、採用マーケティングを体系的に設計する知識は十分ではありませんでした。</p>

<p>LeadGridの価値は、単に使いやすいCMSやサーバーを提供することではありませんでした。ファミーユの内側から伝えたいことだけを並べるのではなく、外部市場を分析し、求職者が何を探しているかを起点にSEOキーワードを選び、その需要に合わせてコラム、採用LP、問い合わせまでの導線を組み立てる。いわば、私たちに不足していたマーケットインの視点を外部から取り込む役割を担ってくれました。</p>

<p>タイミーなどで仕事を探す人を採用LPへ案内する流れも機能し、ホームページ経由で月に3〜5人程度が入社する時期もありました。月数万円、年間では数十万円規模の費用は、当時不足していた機能を補い、採用成果へつなげるための重要な投資でした。LeadGridの導入を、失敗だったとは考えていません。</p>

<h2>採用の入口が、ホームページからMyFamilleへ変わった</h2>

<p>転機は2025年以降です。Helper Service 3.0、4.0へと業務自動化を進める中で、シフト情報と働き手をつなぐ「シフ子」の構想が具体化しました。タイミーで仕事を探す人のニーズと、自社のシフトや採用情報を直接結びつけることで、応募が大量に入る新しい流れが生まれました。</p>

<p>その結果、求職者を作り込んだLPへ誘導すること以上に、MyFamille上のエントリーページへ直接案内し、必要な情報と応募の入口を一つにする方が合理的になりました。LeadGridが作った採用導線の価値が消えたのではなく、採用を支える中心が、自社で構築した仕組みへ移ったのです。</p>

<p>システムや外部サービスは、一度選んだものを使い続けること自体が目的ではありません。その時点の経営課題に対して何を補い、どのような成果を出し、その後どの段階で自社の能力や環境が変わったのかを見る必要があります。以前の最適解に固執しないことも、DXの一部だと考えています。</p>

<h2>いま必要なのは「きれいなサイト」より、更新され続ける一次情報</h2>

<p>検索のあり方は、検索結果のリンクを一つずつ開く形から、AIが複数の情報を整理して答える形へ広がっています。LLMOやGEOという言葉も使われるようになりました。しかし、ここで誤解してはいけないのは、AI向けの特別な言い回しを大量に並べればよい、という話ではないことです。</p>

<p>Googleは、AI OverviewsやAI Modeに表示されるための特別な追加要件はなく、従来のSEOの基本が引き続き有効だと説明しています。また、検索のためだけに大量生成された文章ではなく、読者に役立つ独自情報、分析、実体験を重視する姿勢も明確にしています。</p>

<p>つまり、WordPressへ移しただけでLLMO・GEOの効果が出るわけではありません。重要なのは、外から閲覧でき、検索エンジンが取得できる場所に、現場で実際に経験したこと、そこから得た判断、他社にはない具体的な仕組みを、分かりやすく継続して残すことです。</p>

<p>ファミーユには、この材料があります。訪問介護の働き方を変える仕組み、事業所を越えた人員配置、RPA・AI・LINE WORKSを組み合わせた業務改善、業務効率化の成果を職員の処遇へ戻す考え方など、すでに動き、成果を出している取組が数多くあります。足りなかったのは、材料ではなく、それをタイムリーに公開情報へ変換する経路でした。</p>

<h2>草野ナレッジは、完成したマニュアルではない</h2>

<p>私が蓄積している草野ナレッジは、過去の考えを保管するだけの資料ではありません。日々起きる外部環境の変化や、社内で発生した問題に対して、その都度レビューを行い、「以前の判断は今も正しいか」「新しい事実を踏まえると、何を変えるべきか」を考え、知見を更新するためのものです。</p>

<p>たとえば制度変更、採用環境の変化、新しいAI技術、現場から上がった小さな違和感は、それぞれ単独ではニュースや日報にすぎません。しかし、過去の判断や実績と結びつけて考えると、次の経営判断につながる知識になります。</p>

<p>これまでは、その知識を記事にするために、テーマを選び、過去の記録を探し、構成を考え、画像を用意し、CMSへ登録する必要がありました。重要だと分かっていても、日々の経営や現場対応の中で発信が遅れる理由は、ここにありました。</p>

<h2>ChatGPTへの指示で、移行そのものもほぼ完了できた</h2>

<p>今回のLeadGridからWordPressへの移行も、多くの作業をChatGPTへ指示する形で進めました。旧サイトのページや画像の棚卸し、WordPressへの移送、URLの対応、メニューの整備、リダイレクト、DNSやサーバー設定、表示やリンクの確認など、従来であれば制作会社と何度もやり取りして進める作業の大半を、対話しながら進めることができました。</p>

<p>もちろん、AIへ任せれば何でも正しく終わるわけではありません。どのページを残すか、何を公開するか、利用者様や職員に関する情報をどう守るか、会社として何を伝えたいかは、人が決めなければなりません。AIが担ったのは、判断を奪うことではなく、判断した内容を実際の作業へ変える部分です。</p>

<p>WordPressを選んだのも、単に利用料が安いからではありません。生成AIによってWordPress運用の複雑さそのものが下がり、APIを通じて記事、画像、カテゴリなどを扱い、自社のシステムや自動化と接続できるようになったからです。従来は「人にとって使いやすいCMSか」が大きな選定軸でした。AI時代には、それに加えて「APIがあるか」「自由に拡張できるか」「自動化できる余地があるか」「サーバーを含めて自社で制御できるか」が重要になります。</p>

<p>今後はWordPressの記事更新だけでなく、DNS、cPanel、サーバー、ストレージ、メールといったインフラ層も、AIが状態を確認し、改善案を示し、必要な作業を半自動で進める領域になっていくと考えています。今回の移行は、その可能性を実際の作業で確かめる機会にもなりました。</p>

<h2>ブログは「自動生成」ではなく、「知識を公開可能な形へ変換する」</h2>

<p>新しい仕組みでは、直近の外部ニュースや公式発表を起点に、関連する草野思考ログの独自論点を一つ組み合わせ、経営コラムの下書きを作れます。記事に合うアイキャッチの作成、既存カテゴリの選択、外部参考情報の整理まで、一連の作業として実行できます。</p>

<p>実行方法は二つあります。一つは、設定した時刻に候補情報を確認して下書きを作る自動化。もう一つは、今回のように「この意図で記事にして」とプロンプトを出し、対話しながら仕上げる半自動化です。定型的な工程は自動化し、経営者としての問題意識や最終判断は人が持つ。この分担が現実的だと考えています。</p>

<p>また、草野ナレッジや社内資料のURLを記事へ掲載することはしません。利用者様・職員の個人情報、社内限定情報、公開根拠のない内容を外へ出さないことを前提に、公開できる事実と独自の見解を分け、必要に応じて公式情報を根拠として示します。</p>

<p>AIによる量産自体を目的にすると、読んでも何も残らない記事が増えます。それでは検索にも、AIによる回答にも、そして何より読者にも選ばれません。自動化するのは文章の価値ではなく、価値ある知識を見つけ、整理し、届けるまでの摩擦です。</p>

<h2>社内のみなさんへ――日々の改善が、会社の説明力になる</h2>

<p>この変更は、広報担当だけの話ではありません。現場で起きた問題、うまくいかなかった運用、そこから生まれた改善、実際に出た成果が、会社の知識の源になります。</p>

<p>すべてを公開する必要はありません。しかし、社内でしか分からない工夫を適切に整理し、公開できる形へ変えれば、利用者様やご家族には安心材料となり、働く場所を探している方にはファミーユの実像が伝わり、同じ課題を持つ介護・福祉事業者には新しい視点を提供できます。</p>

<p>ホームページは、一度作って終わる会社案内ではなくなります。外部環境の変化を取り込み、社内の問題解決を知識へ変え、公開した反応をまた次の改善へ戻す循環の一部になります。日々の仕事の中で得た気づきが、会社の説明力と信頼をつくる時代になったのだと思います。</p>

<h2>見直したのは費用だけではなく、基盤を選ぶ判断軸</h2>

<p>月数万円、年間では数十万円規模の費用を見直せることは、小さくない効果です。しかし、今回もっと大きく変えたのは、会社の中で生まれた知識が外へ届くまでの距離と、システムを選ぶ判断軸です。</p>

<p>外部サービスを利用していた時代には、その時代なりの合理性がありました。そして今、ファミーユには、自分たちの仕組みを自分たちで改善し、その成果を自分たちの言葉で発信できる基盤が育っています。だからこそ、運用の主導権を自社へ戻す時期が来たと判断しました。</p>

<p>LeadGridからWordPressへの移行はゴールではありません。草野ナレッジ、外部情報、社内の実践を結び、価値ある一次情報を継続して社会へ届けるためのスタートです。AI時代の発信で問われるのは、文章を何本作れるかではなく、その会社にしか語れない経験と判断を、どれだけ速く、正確に、役立つ形で届けられるかだと考えています。</p>

<h2>外部参考情報</h2>
<ul>
  <li><a href="https://developers.google.com/search/docs/fundamentals/ai-optimization-guide" target="_blank" rel="noopener noreferrer">Google Search Central「生成AI機能向けのウェブサイト最適化」</a></li>
  <li><a href="https://developers.google.com/search/docs/fundamentals/creating-helpful-content" target="_blank" rel="noopener noreferrer">Google Search Central「有用で信頼性の高い、ユーザー第一のコンテンツの作成」</a></li>
  <li><a href="https://developers.google.com/search/docs/fundamentals/using-gen-ai-content" target="_blank" rel="noopener noreferrer">Google Search Central「ウェブサイトで生成AIコンテンツを使用する際のガイダンス」</a></li>
  <li><a href="https://arxiv.org/abs/2311.09735" target="_blank" rel="noopener noreferrer">GEO: Generative Engine Optimization（研究論文）</a></li>
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
      "Content-Disposition": 'attachment; filename="website-migration-knowledge-publishing.webp"',
    },
    body: imageBytes,
  });
  featuredMediaId = Number(media.id);

  await wordpress(`media/${featuredMediaId}?context=edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      alt_text: "外部の閉じたWeb基盤から、社内ナレッジが循環するWordPressの発信基盤への移行",
      caption: "ファミーユの知識と外部情報を結び、発信へつなげる新しいホームページ基盤",
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
    status: "draft",
    featured_media: featuredMediaId,
    categories: [24, 26],
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
