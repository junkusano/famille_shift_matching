import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, applicantName } = body;

  try {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_PASS;

    if (!user || !pass) {
      return NextResponse.json({ error: "環境変数未設定" }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"ファミーユ採用" <${user}>`,
      to: email,
      subject: "雇用契約書のご案内",
      html: `
        <p>${applicantName}様</p>
        <p>このたびはエントリーありがとうございます。</p>
        <p>以下のリンクから雇用契約書をご確認の上、ご署名をお願いいたします。</p>
        <ul>
          <li><a href="https://www.digisigner.com/online/showTemplate?linkId=02ff0a14-0309-40b6-8d5f-202bfa695232" target="_blank">雇用契約書</a></li>
          <li><a href="https://www.digisigner.com/online/showTemplate?linkId=3859482d-e0df-494f-ae9e-8146ef298bb6" target="_blank">個人情報同意書</a></li>
          <li><a href="https://www.digisigner.com/online/showTemplate?linkId=840b3b68-f033-4323-af5f-cd9198f5f647" target="_blank">私有車誓約書（該当者のみ）</a></li>
        </ul>
        <p>ご不明点があればいつでもご連絡ください。</p>
      `,
    });

    return NextResponse.json({ status: "ok" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "不明なエラー";
    console.error("メール送信エラー:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
