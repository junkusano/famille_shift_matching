export function lineworksInviteTemplate({
  fullName,
  userId,
  tempPassword
}: {
  fullName: string;
  userId: string;
  tempPassword: string;
}) {
  return {
    subject: 'マイ・ファミーユ：LINE WORKS 初回ログイン情報のご案内',
    body: `
${fullName} 様

ファミーユ内の情報管理ツールであるLINE WORKS のアカウントを作成いたしました。利用者様の情報や各種規定・マニュアル・お知らせ等、職員個人の手続きなどがこのアプリ内で情報共有されています。

以下の情報で初回ログインをお願いします。

【ログインID】
${userId}@shi-on

【初期パスワード】
${tempPassword}

下記のガイドページに、アプリのインストール方法やログイン手順をまとめています。
必要に応じてご参照ください。

▶ ログインガイドページ
https://myfamille.shi-on.net/lineworks-login-guide

ログイン後は必ずパスワードを変更してください。
ご不明な点がございましたら、管理者までご連絡ください。
    `.trim()
  };
}
