import { sendEmail } from "@/lib/email";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { sendSms } from "@/lib/sms";

const EXPENSE_CLAIM_LINEWORKS_CHANNEL_ID = "472ef64f-c854-f6bd-7ec1-2e24c9cf8f9d";

export type ExpenseClaimNotificationEvent = "accepted" | "paid" | "rejected";

export type ExpenseClaimNotification = {
    event: ExpenseClaimNotificationEvent;
    claimId: string;
    applicantName: string;
    applicantEmail: string | null;
    applicantPhone: string | null;
    workDate: string;
    totalAmount: number;
    rejectionReason?: string | null;
};

function formatAmount(value: number): string {
    return new Intl.NumberFormat("ja-JP").format(value);
}

function formatDate(value: string): string {
    const [year, month, day] = value.split("-");
    return year && month && day ? `${year}年${Number(month)}月${Number(day)}日` : value;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function isEmail(value: string | null): value is string {
    return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function content(notification: ExpenseClaimNotification): { subject: string; html: string; sms: string; lineworks: string } {
    const name = escapeHtml(notification.applicantName);
    const date = escapeHtml(formatDate(notification.workDate));
    const amount = escapeHtml(formatAmount(notification.totalAmount));
    const claimId = escapeHtml(notification.claimId);

    if (notification.event === "paid") {
        return {
            subject: "【ファミーユ】経費精算のお振込みが完了しました",
            html: `<p>${name} 様</p><p>申請いただいた経費精算について、お振込み手続きが完了しました。</p><p>勤務日：${date}<br />振込金額：${amount}円<br />ステータス：振込済<br />申請ID：${claimId}</p><p>金融機関の処理状況により、口座への反映まで時間がかかる場合があります。<br />ご申請ありがとうございました。</p><p style="font-size:12px;color:#666">このメールは経費精算システムから自動送信されています。</p>`,
            sms: `【ファミーユ】\n経費精算${amount}円のお振込みが完了しました。`,
            lineworks: `【経費精算：振込済】\n申請ID：${notification.claimId}\n申請者：${notification.applicantName}\n勤務日：${formatDate(notification.workDate)}\n金額：${formatAmount(notification.totalAmount)}円`,
        };
    }

    if (notification.event === "rejected") {
        const reason = escapeHtml(notification.rejectionReason?.trim() || "理由の記載はありません。");
        return {
            subject: "【ファミーユ】経費精算の確認について",
            html: `<p>${name} 様</p><p>申請いただいた経費精算について、以下の理由により今回は精算処理を行うことができませんでした。</p><p>却下理由：</p><p style="white-space:pre-wrap">${reason}</p><p>申請内容をご確認ください。必要な場合は再申請または担当者へお問い合わせください。</p><p style="font-size:12px;color:#666">このメールは経費精算システムから自動送信されています。</p>`,
            sms: `【ファミーユ】\n経費精算の申請について確認が必要です。メールをご確認ください。`,
            lineworks: `【経費精算：却下】\n申請ID：${notification.claimId}\n申請者：${notification.applicantName}\n勤務日：${formatDate(notification.workDate)}\n金額：${formatAmount(notification.totalAmount)}円\n却下理由：${notification.rejectionReason?.trim() || "未入力"}`,
        };
    }

    return {
        subject: "【ファミーユ】経費精算を受け付けました",
        html: `<p>${name} 様</p><p>経費精算の申請を受け付けました。</p><p>勤務日：${date}<br />申請金額：${amount}円<br />現在のステータス：申請中<br />申請ID：${claimId}</p><p>内容を確認後、振込手続きを行います。</p><p style="font-size:12px;color:#666">このメールは経費精算システムから自動送信されています。</p>`,
        sms: `【ファミーユ】\n経費精算を受け付けました。\n申請額：${amount}円\n現在：申請中`,
        lineworks: `【経費精算：新規申請】\n申請ID：${notification.claimId}\n申請者：${notification.applicantName}\n勤務日：${formatDate(notification.workDate)}\n金額：${formatAmount(notification.totalAmount)}円\nステータス：申請中`,
    };
}

/** Sends internal LINE WORKS first, then notifies the applicant by email with SMS fallback. */
export async function sendExpenseClaimNotifications(notification: ExpenseClaimNotification): Promise<void> {
    const message = content(notification);

    try {
        const token = await getAccessToken();
        await sendLWBotMessage(EXPENSE_CLAIM_LINEWORKS_CHANNEL_ID, message.lineworks, token);
    } catch {
        console.error("[expense-claim-notification] LINE WORKS notification failed", { claimId: notification.claimId, event: notification.event });
    }

    if (isEmail(notification.applicantEmail)) {
        try {
            const emailResult = await sendEmail({ to: notification.applicantEmail, subject: message.subject, html: message.html });
            if (emailResult.status === "ok") return;
            console.error("[expense-claim-notification] applicant email notification failed", { claimId: notification.claimId, event: notification.event });
        } catch {
            console.error("[expense-claim-notification] applicant email notification threw", { claimId: notification.claimId, event: notification.event });
        }
    }

    if (notification.applicantPhone) {
        try {
            const smsResult = await sendSms({ to: notification.applicantPhone, body: message.sms });
            if (smsResult.status === "error") {
                console.error("[expense-claim-notification] applicant SMS notification failed", { claimId: notification.claimId, event: notification.event });
            }
        } catch {
            console.error("[expense-claim-notification] applicant SMS notification threw", { claimId: notification.claimId, event: notification.event });
        }
    } else {
        console.error("[expense-claim-notification] applicant contact notification skipped", { claimId: notification.claimId, event: notification.event });
    }
}
