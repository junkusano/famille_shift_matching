import { staffContractLinks } from "@/lib/staffContractLinks";


export interface EntryDetail {
  id: string;
  last_name_kanji: string;
  first_name_kanji: string;
  last_name_kana: string;
  first_name_kana: string;
  gender: string;
  birth_year: number;
  birth_month: number;
  birth_day: number;
  address: string;
  postal_code: string;
  phone: string;
  email: string;
  motivation: string;
  work_styles: string[];
  workstyle_other: string;
  commute_options?: string[];
  health_condition: string;
  photo_url?: string;
  attachments?: {
    url: string | null;
    type?: string;
    label?: string;
    mimeType?: string | null;
  }[];
  created_at: string;
  consent_snapshot: string;
  manager_note: string;
}

export function generateContractsAfterInterviewHtml(entry: EntryDetail): string {
  return `
    <p>${entry.last_name_kanji} ${entry.first_name_kanji} 様</p>

    <p>このたびは<strong>ファミーユヘルパーサービス</strong>の面談・選考にお時間をいただき、誠にありがとうございます。</p>

    <p>
    雇用契約書等の確認・電子サインのため、以下のリンクをご案内いたします。<br>
    必要事項をご確認の上、署名の手続きをお願いいたします。
    </p>

    <ul>
      <li><a href="${staffContractLinks.employment}" target="_blank">雇用契約書</a></li>
      <li><a href="${staffContractLinks.privacy}" target="_blank">個人情報同意書</a></li>
      <li><a href="${staffContractLinks.privateCar}" target="_blank">私有車誓約書（該当者のみ）</a></li>
    </ul>

    <p><a href="https://youtube.com/shorts/aOWp6dtvVTo?si=B3p4I03SZ2eodWKh">電子サインの方法（動画）</a></p>

    <p>
    ご不明点やご相談がありましたら、<br>
    採用担当：新川（090-9140-2642）、総務担当：西尾（050-3702-2802）、<br>
    または <a href="mailto:recruit@shi-on.net">recruit@shi-on.net</a> までお気軽にお問い合わせください。
    </p>

    <p>引き続きどうぞよろしくお願いいたします。<br>ファミーユヘルパーサービス 採用担当一同</p>
  `;
}
