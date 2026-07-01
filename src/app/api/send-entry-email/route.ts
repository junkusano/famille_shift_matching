import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { generateApplicantHtml } from "@/lib/emailTemplates";
import { generateRecruiterHtml } from "@/lib/emailTemplates/recruiterEntry";
import { ApplicantBody } from "@/types/email";

export async function POST(req: Request) {
  const body: ApplicantBody = await req.json();

  const rawBody = body as ApplicantBody & Record<string, unknown>;

  const applicantName =
    body.applicantName ||
    String(rawBody.name || "") ||
    `${String(rawBody.last_name_kanji || "")}${String(rawBody.first_name_kanji || "")}`;

  const applicantKana =
    body.applicantKana ||
    String(rawBody.kana || "") ||
    `${String(rawBody.last_name_kana || "")}${String(rawBody.first_name_kana || "")}`;

  const normalizedBody = {
    ...body,
    applicantName,
    applicantKana,
    name: applicantName,
    kana: applicantKana,
  };

  // メール本文生成
  const applicantHtml = generateApplicantHtml(normalizedBody);
  const recruiterHtml = generateRecruiterHtml(normalizedBody);

  // エントリー者へのメール送信
  const response = await sendEmail({
    to: normalizedBody.email,
    subject: "【ファミーユ】エントリーありがとうございます",
    html: applicantHtml,
  });

  if (response.status === "error") {
    return NextResponse.json({ error: response.error }, { status: 500 });
  }

  // 採用担当者への通知
  await sendEmail({
    to: process.env.RECRUIT_CONTACT_EMAIL || "recruit@shi-on.net",
    subject: `【新規エントリー】${normalizedBody.applicantName}様より`,
    html: recruiterHtml,
  });

  return NextResponse.json({ status: "ok", messageId: response.messageId });
}