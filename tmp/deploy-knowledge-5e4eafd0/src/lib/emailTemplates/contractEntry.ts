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
    以下が、今後の入社・お仕事開始の手順です。
    </p>

    <p>
    💡 <strong>この後の流れ（概要）</strong><br>
    ・雇用契約書等の電子サインをお願いします。すでにエントリー完了ページからサイン済みの方は不要です。<a href="https://youtube.com/shorts/aOWp6dtvVTo?si=B3p4I03SZ2eodWKh">電子サインの方法（動画）</a><br>
    <ul>
      <li><a href="${staffContractLinks.employment}" target="_blank">雇用契約書（必須）/a></li>
      <li><a href="${staffContractLinks.privacy}" target="_blank">個人情報同意書（必須）</a></li>
      <li><a href="${staffContractLinks.privateCar}" target="_blank">私有車誓約書（該当者のみ）</a></li>
    </ul>
    ・マイファミーユ（社内Ｗｅｂアプリ）ログインの認証メールが届きますので、パスワード設定し、ログインしてください<br>
    ・社内ＳＮＳラインワークスのログイン情報（ユーザーＩＤ／パスワード）がメールで届きますので、ログインしてください<br>
    ・ラインワークスの「人事労務サポートルーム」「勤務キャリアコーディネートルーム」のグループで情報確認の方法や上司にあたるマネジャーからの挨拶があります<br>
    ・マイファミーユのシフ子から、ご希望のシフトを取っていただくことができます。<a href="https://www.youtube.com/shorts/Hydp7EY268A">シフ子の概要</a><br>
    </p>

    <p>
    ご不明点やご相談がありましたら、 採用担当：新川（090-9140-2642）、総務担当：西尾（050-3702-2802）、<br>
    または <a href="mailto:recruit@shi-on.net">recruit@shi-on.net</a> までお気軽にお問い合わせください。
    </p>

    <p>引き続きどうぞよろしくお願いいたします。</p>
  `;
}
