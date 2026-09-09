import nodemailer from "nodemailer";

// メール送信のための共通関数
export async function sendEmail({
    to,
    subject,
    html,
    from,
}: {
    to: string;
    subject: string;
    html: string;
    from?: string;
}) {
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASSWORD;
    const smtpServer = process.env.SMTP_SERVER;

    if (!smtpUser || !smtpPass || !smtpServer) {
        console.error("SMTP 環境変数未設定");
        return { status: "error", error: "SMTP 環境変数未設定" };
    }

    const transporter = nodemailer.createTransport({
        host: smtpServer,
        port: 465,
        secure: true,
        auth: {
            user: smtpUser,
            pass: smtpPass,
        },
    });

    try {
        const info = await transporter.sendMail({
            from: from || `"ファミーユ採用" <${smtpUser}>`,
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
