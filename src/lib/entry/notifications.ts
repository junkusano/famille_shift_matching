import { sendEmail } from "@/lib/email";
import { generateApplicantHtml } from "@/lib/emailTemplates";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { supabaseAdmin } from "@/lib/supabase/service";

type Applicant = { name: string; kana: string; birth: string; phone: string; email: string };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function recruitmentChannelId() {
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("channel_id")
    .eq("group_name", "採用応募グループ")
    .maybeSingle();
  if (error || !data?.channel_id) throw new Error("Recruitment LINE WORKS channel is unavailable");
  return data.channel_id;
}

export async function notifyRecruitment(kind: "new" | "candidate" | "reapply", applicant: Applicant, detail: string) {
  const labels = { new: "新規応募", candidate: "再応募候補", reapply: "再応募" };
  const text = `【${labels[kind]}】\n\n氏名：${applicant.name}\nよみ：${applicant.kana}\n生年月日：${applicant.birth}\n電話番号：${applicant.phone}\nメール：${applicant.email}\n\n${detail}`;
  const channelId = await recruitmentChannelId();
  await sendLWBotMessage(channelId, text, await getAccessToken());
}

export async function sendApplicantGuide(kind: "candidate" | "reapply", email: string) {
  const text = kind === "reapply"
    ? "リエントリーを歓迎します。<br><br>好きな時間でシフトに入れるシフ子、日払い制度、パフォーマンスをスコア化して時給アップを目指せる仕組みなど、新しいファミーユでの経験をぜひ始めてください。<br><br>再応募を受け付けました。過去の応募情報を引き継いで採用担当が確認いたします。今後の手続きについては改めてご案内いたします。"
    : "ご応募ありがとうございます。<br><br>入力いただいた情報から、過去にファミーユへご応募いただいた情報が確認されました。<br><br>重複した応募情報を作成せず、再応募として確認いたします。<br>採用担当より改めてご案内いたしますので、次のご連絡をお待ちください。";
  return sendEmail({ to: email.trim(), subject: "【ファミーユ】応募受付のご案内", html: `<p>${escapeHtml(email.trim())} 様</p><p>${text}</p>` });
}

export async function sendNewApplicantConfirmation(applicant: Applicant, payload: Record<string, unknown>) {
  return sendEmail({
    to: applicant.email,
    subject: "【ファミーユ】エントリーありがとうございます",
    html: generateApplicantHtml({ ...payload, applicantName: applicant.name, applicantKana: applicant.kana, name: applicant.name, kana: applicant.kana, email: applicant.email } as never),
  });
}
