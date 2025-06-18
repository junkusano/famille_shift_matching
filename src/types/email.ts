export interface ApplicantBody {
  applicantName: string;
  applicantKana: string;
  age: number;
  gender: string;
  email: string;
  phone: string;
  postal_code: string;
  address: string;
  motivation: string;
  workstyle_other: string;
  commute_options: string[];
  health_condition: string;
  photo_url: string;
  license_front_url: string;
  license_back_url: string;
  certification_urls: string[];
  work_styles?: string[];
  noCertifications?: string;
}
