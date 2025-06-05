import nodemailer from "nodemailer";

// メール送信のための共通関数
export async function sendEmail({
    to,
    subject,
    html,
    from = '"マイ・ファミーユ" <noreply@info.shi-on.net>',
}: {
    to: string;
    subject: string;
    html: string;
    from?: string;
}) {
    try {
        // SMTP設定（noreply@info.shi-on.net から送信）
        const transporter = nodemailer.createTransport({
            host: "info.shi-on.net", // メールサーバーのホスト名
            port: 465, // 適切なポート番号
            secure: true, // SSL/TLSを無効化
            auth: {
                user: "noreply@info.shi-on.net", // メール送信元
                pass: process.env.SMTP_PASSWORD, // 環境変数からSMTPパスワードを取得
            },
        });

        const info = await transporter.sendMail({
            from,
            to,
            subject,
            html,
        });

        return { status: "ok", messageId: info.messageId };
    } catch (error) {
        console.error("メール送信エラー:", error);
        return { status: "error", error: error instanceof Error ? error.message : "不明なエラー" };
    }
}
