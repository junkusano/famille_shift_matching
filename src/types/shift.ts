//types/shift
export interface SupabaseShiftRaw {
  id?: string;
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
  staff_02_attend_flg?: string | number | boolean | null;
  staff_03_attend_flg?: string | number | boolean | null;
  staff_01_level_sort?: number | null;
  staff_02_level_sort?: number | null;
  staff_03_level_sort?: number | null;
  judo_ido?: string | number | null;
  postal_code?: string;
  name?: string;
  gender_request_name?: string;
  male_flg?: boolean;
  female_flg?: boolean;
  postal_code_3?: string;
  district?: string;
  level_sort_order?: number;
  require_doc_group?: string | null;
  tokutei_comment?: string | null;
}

export interface ShiftData {
  id?: string;
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
  staff_02_attend_flg?: string | number | boolean | null;
  staff_03_attend_flg?: string | number | boolean | null;
  staff_01_level_sort?: number | null;
  staff_02_level_sort?: number | null;
  staff_03_level_sort?: number | null;
  kodoengo_plan_link?: string | null;
  judo_ido?: string | number | null;
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
  level_sort_order?: number | null;
  require_doc_group?: string | null;
  tokutei_comment?: string | null;
}
