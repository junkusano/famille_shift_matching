import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { generateApplicantHtml } from "@/lib/emailTemplates";
import { generateRecruiterHtml } from "@/lib/emailTemplates/recruiterEntry";
import { ApplicantBody } from "@/types/email";

export async function POST(req: Request) {
  
  const body: ApplicantBody = await req.json();
  console.log('受診したメール:',body);

  // メール本文生成
  const applicantHtml = generateApplicantHtml(body);
  const recruiterHtml = generateRecruiterHtml(body);

  // エントリー者へのメール送信
  const response = await sendEmail({
    to: body.email,
    subject: "【ファミーユ】エントリーありがとうございます",
    html: applicantHtml,
  });

  if (response.status === "error") {
    return NextResponse.json({ error: response.error }, { status: 500 });
  }

  // 採用担当者への通知
  await sendEmail({
    to: process.env.RECRUIT_CONTACT_EMAIL || "recruit@shi-on.net",
    subject: `【新規エントリー】${body.applicantName}様より`,
    html: recruiterHtml,
  });

  return NextResponse.json({ status: "ok", messageId: response.messageId });
}
