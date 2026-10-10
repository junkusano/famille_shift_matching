import "server-only";

import { sendEmail } from "@/lib/email";

export type MonitoringEmailDeliveryResult =
  | { status: "skipped"; to: null }
  | { status: "sent"; to: string; messageId: string | null }
  | { status: "failed"; to: string; error: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorText(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  return text(value) || fallback;
}

export async function sendMonitoringPdfEmail(params: {
  to: string | null | undefined;
  officeName: string | null | undefined;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  filename: string;
  pdf: Buffer;
}): Promise<MonitoringEmailDeliveryResult> {
  const to = text(params.to);
  if (!to) return { status: "skipped", to: null };
  if (!validEmail(to)) return { status: "failed", to, error: "送信先メールアドレスの形式が正しくありません" };

  const subject = `【ファミーユ】モニタリング送付（${params.periodStart}～${params.periodEnd}）`;
  const officeName = escapeHtml(text(params.officeName) || "ご担当事業所");
  const clientName = escapeHtml(params.clientName.trim() || "ご利用者");
  const smtpUser = process.env.SMTP_USER?.trim();
  const configuredFrom = process.env.MONITORING_EMAIL_FROM?.trim();
  const from = configuredFrom || (smtpUser ? `"ファミーユヘルパーサービス愛知" <${smtpUser}>` : undefined);

  try {
    const result = await sendEmail({
      to,
      subject,
      from,
      html: [
        `<p>${officeName} 御中</p>`,
        "<p>平素よりお世話になっております。ファミーユヘルパーサービス愛知です。</p>",
        `<p>${clientName}様のモニタリングを添付いたします。ご確認をお願いいたします。</p>`,
        "<p>本メールは送信専用です。</p>",
      ].join(""),
      attachments: [{ filename: params.filename, content: params.pdf, contentType: "application/pdf" }],
    });
    if (result.status === "ok") {
      return { status: "sent", to, messageId: result.messageId ?? null };
    }
    return { status: "failed", to, error: errorText(result.error, "メール送信に失敗しました") };
  } catch (error) {
    return {
      status: "failed",
      to,
      error: errorText(error, "メール送信に失敗しました"),
    };
  }
}
