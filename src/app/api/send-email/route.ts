import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        // 環境変数チェック
        const user = process.env.GMAIL_USER;
        const pass = process.env.GMAIL_PASS;
        const recipient = process.env.RECRUIT_CONTACT_EMAIL;
        if (!user || !pass || !recipient) {
            return NextResponse.json({ error: "環境変数が未設定です" }, { status: 500 });
        }

        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            auth: { user, pass },
        });

        const htmlBody = `
  <h2>新規エントリーがありました</h2>
  <p>以下の内容でエントリーが完了しました。</p>
  <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
    <tbody>
      <tr><td><strong>氏名</strong></td><td>${body.applicantName}</td></tr>
      <tr><td><strong>メールアドレス</strong></td><td>${body.email}</td></tr>
      <tr><td><strong>電話番号</strong></td><td>${body.phone}</td></tr>
      <tr><td><strong>郵便番号</strong></td><td>${body.postal_code}</td></tr>
      <tr><td><strong>住所</strong></td><td>${body.address}</td></tr>
      <tr><td><strong>志望動機</strong></td><td>${body.motivation}</td></tr>
      <tr><td><strong>働き方の希望（自由記述）</strong></td><td>${body.workstyle_other}</td></tr>
      <tr><td><strong>通勤方法</strong></td><td>${(body.commute_options || []).join("<br>")}</td></tr>
      <tr><td><strong>健康状態</strong></td><td>${body.health_condition}</td></tr>
      <tr><td><strong>顔写真</strong></td><td><a href="${body.photo_url}" target="_blank">画像を見る</a></td></tr>
      <tr><td><strong>免許証（表）</strong></td><td><a href="${body.license_front_url}" target="_blank">画像を見る</a></td></tr>
      <tr><td><strong>免許証（裏）</strong></td><td><a href="${body.license_back_url}" target="_blank">画像を見る</a></td></tr>
      <tr>
  <td><strong>資格証明書</strong></td>
  <td>
    ${Array.isArray(body.certification_urls) && body.certification_urls.length > 0
                ? body.certification_urls
                    .map((url, index) => `<div>・<a href="${url}" target="_blank">証明書${index + 1}</a></div>`)
                    .join("")
                : "アップロードなし"
            }
  </td>
</tr>
    </tbody>
  </table>
  <p>※ 上記リンクから直接画像ファイルを確認できます。</p>
`;
        const info = await transporter.sendMail({
            from: `"ファミーユ採用通知" <${user}>`,
            to: recipient,
            subject: `【新規エントリー】${body.applicantName}様より`,
            html: htmlBody,
        });

        return NextResponse.json({ status: 'ok', messageId: info.messageId });
    } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "不明なエラー";
    console.error("メール送信エラー:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
}

}
