export interface SupabaseShiftRaw {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
  postal_code?: string;
  name?: string;
  gender_request_name?: string;
  male_flg?: boolean;
  female_flg?: boolean;
  postal_code_3?: string;
  district?: string;
  level_sort_order?: number;
}

export interface ShiftData {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
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
  postal_code_3: string;
  district: string;
  cs_name?: string;
  commuting_flg?: boolean;
  standard_route?: string;
  standard_trans_ways?: string;
  standard_purpose?: string;
  biko?: string;
}
