// src/types/roster.ts

export type RosterStaff = {
  id: string;
  name: string;
  team?: string | null;
  team_order?: number | null;
  level?: string | null;
  level_order?: number | null;
  status?: "ACTIVE" | "RETIRED" | string;
  roster_sort?: string;
};

export type RosterShiftDialogData = {
  shift_id: number;
  shift_date: string;
  start_at: string;
  end_at: string;

  kaipoke_cs_id?: string | number;
  client_name: string;

  postal_code?: string | null;
  dsp_short?: string | null;
  address?: string | null;
  cs_note?: string | null;
  map_url?: string | null;

  gender_request?: string | null;
  gender_request_name?: string | null;
  male_flg?: boolean | null;
  female_flg?: boolean | null;

  service_code: string;
  service_name: string;

  staff_id_1?: string | null;
  staff_id_2?: string | null;
  staff_id_3?: string | null;
  staff_02_attend_flg?: boolean | null;
  staff_03_attend_flg?: boolean | null;

  required_staff_count?: number | null;
  two_person_work_flg?: boolean | null;
  judo_ido?: string | null;
};

export type RosterShiftCard = {
  id: string;
  staff_id: string;
  start_at: string;
  end_at: string;
  client_name: string;
  service_name: string;
  service_code: string;
  kaipoke_cs_id?: string | number;
  dsp_short?: string | null;
  staff_slot?: 1 | 2 | 3;

  gender_request_name?: string | null;
  male_flg?: boolean | null;
  female_flg?: boolean | null;

  dialog?: RosterShiftDialogData;
};

export type RosterDailyView = {
  date: string;
  staff: RosterStaff[];
  shifts: RosterShiftCard[];
};