import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  console.log("受信したリクエストボディ", req.body);
  const body = await req.json();

  console.log('受信したメール送信リクエスト:', body);

  // 宛先チェック
  if (!body.to) {
    console.error('送信先メールアドレスが未定義です');
    return NextResponse.json({ error: '送信先メールアドレスが未定義です' }, { status: 400 });
  }

  // 件名
  const subject = typeof body.subject === 'string' ? body.subject : '(件名なし)';

  // 本文決定処理（html優先、次にbody、さらにオブジェクトはJSON文字列化）
  let htmlContent: string | null = null;

  if (typeof body.html === 'string') {
    htmlContent = body.html;
  } else if (typeof body.body === 'string') {
    htmlContent = body.body;
  } else if (typeof body.html === 'object') {
    htmlContent = JSON.stringify(body.html, null, 2);
  } else if (typeof body.body === 'object') {
    htmlContent = JSON.stringify(body.body, null, 2);
  }

  if (!htmlContent) {
    console.error('メール本文が指定されていません');
    return NextResponse.json({ error: 'メール本文が指定されていません' }, { status: 400 });
  }

  // メール送信実行
  const response = await sendEmail({
    to: body.to,
    subject,
    html: htmlContent,
  });

  if (response.status === 'error') {
    console.error('メール送信エラー:', response.error);
    return NextResponse.json({ error: response.error }, { status: 500 });
  }

  console.log('メール送信成功！messageId:', response.messageId);

  return NextResponse.json({ status: 'ok', messageId: response.messageId });
}
