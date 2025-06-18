import { staffContractLinks } from "@/lib/staffContractLinks";
import { ApplicantBody } from "@/types/email";
export function generateContractEntryHtml(body: ApplicantBody): string {
    return `
    <p>${body.applicantName}様</p>

    <p>このたびは<strong>ファミーユヘルパーサービス</strong>にエントリーいただき、誠にありがとうございます。</p>

    <p>
    私たちファミーユ採用チーム一同、あなたのエントリーにわくわくしています。<br>
    ファミーユでの新しい一歩を、ぜひ一緒に歩んでいければと思います。
    </p>

    <p>
    このメールはエントリー受付完了のご案内です。<br>
    これから採用担当がエントリー内容を確認のうえ、メールまたはお電話でご連絡差し上げます。
    </p>

    <p>
    💡 <strong>この後の流れ（概要）</strong><br>
    ・リンクをつけていますが、雇用契約書等の電子サインをお願いします。<br>
    ・その後、エントリー内容の確認と担当者からのご連絡があります。<br>
    ・マイ・ファミーユにログイン・ラインワークス・カイポケ訪問記録など社内情報ツールのログインの案内<br>
    ・シフト希望の調整（今後は シフトセルフコーディネートが開始予定）
    </p>

    <p>
    以下のリンクから事前に契約書・同意書をご確認いただけます。<br>
    認証時にも改めて正式にご案内いたします。
    </p>
    <ul>
      <li><a href="${staffContractLinks.employment}" target="_blank">雇用契約書</a></li>
      <li><a href="${staffContractLinks.privacy}" target="_blank">個人情報同意書</a></li>
      <li><a href="${staffContractLinks.privateCar}" target="_blank">私有車誓約書（該当者のみ）</a></li>
    </ul>

    <p>
    ご不明点やご相談がありましたら、<br>
    採用担当：新川（090-9140-2642）、総務担当：西尾（050-3702-2802）、<br>
    または <a href="mailto:recruit@shi-on.net">recruit@shi-on.net</a> までお気軽にお問い合わせください。
    </p>

    <p>引き続きどうぞよろしくお願いいたします。</p>
  `;
}
