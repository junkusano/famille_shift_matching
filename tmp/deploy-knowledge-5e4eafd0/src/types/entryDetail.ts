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
