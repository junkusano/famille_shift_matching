export function lineworksInviteTemplate({ fullName, userId, tempPassword }: {
  fullName: string;
  userId: string;
  tempPassword: string;
}) {
  return {
    subject: 'マイ・ファミーユ：LINE WORKS 初回ログイン情報のご案内',
    body: `
<p>${fullName} 様</p>

<p>ファミーユ内の情報管理ツールであるLINE WORKS のアカウントを作成いたしました。利用者様の情報や各種規定・マニュアル・お知らせ等、職員個人の手続きなどがこのアプリ内で情報共有されています。</p>

<p>以下の情報で初回ログインをお願いします。</p>

<p><strong>【ログインID】</strong><br>
${userId}@shi-on</p>

<p><strong>【初期パスワード】</strong><br>
${tempPassword}</p>

<p>下記のガイドページに、アプリのインストール方法やログイン手順をまとめています。<br>
必要に応じてご参照ください。</p>

<p>▶ <a href="https://myfamille.shi-on.net/lineworks-login-guide">ログインガイドページ</a></p>

<p>ログイン後は必ずパスワードを変更してください。<br>
ご不明な点がございましたら、管理者までご連絡ください。</p>
    `.trim()
  };
}
