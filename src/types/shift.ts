export interface SupabaseShiftRaw {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
  cs_kaipoke_info?: {
    address?: string;
    name?: string;
    cs_gender_request?: {
      gender_request_name?: string;
      male_flg?: boolean;
      female_flg?: boolean;
    };
  };
}

export interface ShiftData {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
  address: string;
  client_name: string;
  gender_request_name: string;
  male_flg: boolean;
  female_flg: boolean;
}
