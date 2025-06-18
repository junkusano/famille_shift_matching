export function generateRegularEntryHtml(body: any): string {
  return`
<p>${body.applicantName}様</p>

<p>このたびは<strong>ファミーユヘルパーサービス</strong>にエントリーいただき、誠にありがとうございます。</p>

<p>
私たちファミーユ採用チーム一同、あなたのエントリーにわくわくしています。<br>
「マイ・ファミーユ」での新しい一歩を、ぜひ一緒に歩んでいければと思います。
</p>

<p>
このメールはエントリー受付完了のご案内です。<br>
これから採用担当がエントリー内容を確認のうえ、メールまたはお電話でご連絡差し上げます。
</p>

<p>
💡 <strong>お願い</strong><br>
以下の内容を<strong>このメールに返信</strong>いただくか、採用担当宛：<a href="mailto:recruit@shi-on.net">recruit@shi-on.net</a> にお送りください。
</p>

<hr>
<p>以下をコピーしてご記入ください：</p>

<pre style="background: #f8f8f8; padding: 10px; border-radius: 5px;">
ご希望の面接日時①：
ご希望の面接日時②：

ご希望の面接方法：（どちらかを残してください）
・Google Meet（オンライン面談）
・事業所での面談

（事業所面談の場合）希望事業所：
（以下から選択）
春日井市味美白山 / 春日井市高蔵寺 / 名古屋市東区出来町 / 名古屋市熱田区新尾頭
</pre>
<hr>

<p>
📲 <strong>Google Meet アプリ（無料）ダウンロードはこちら</strong><br>
<a href="https://apps.apple.com/jp/app/google-meet/id1013231476" target="_blank">iPhone / iPad 用 Google Meet</a><br>
<a href="https://play.google.com/store/apps/details?id=com.google.android.apps.meetings" target="_blank">Android 用 Google Meet</a>
</p>

<p>
ご不明点やご相談がありましたら、<br>
採用担当：新川（090-9140-2642）、総務担当：西尾（050-3702-2802）、<br>
または <a href="mailto:recruit@shi-on.net">recruit@shi-on.net</a> までお気軽にお問い合わせください。
</p>

<p>引き続きどうぞよろしくお願いいたします。</p>
`;
}