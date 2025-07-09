import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { staffContractLinks } from "@/lib/staffContractLinks";

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
      <li><a href="${staffContractLinks.employment}" target="_blank">雇用契約書</a></li>
      <li><a href="${staffContractLinks.privacy}" target="_blank">個人情報同意書</a></li>
      <li><a href="${staffContractLinks.privateCar}" target="_blank">私有車誓約書（該当者のみ）</a></li>
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
