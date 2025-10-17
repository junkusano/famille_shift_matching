//types/shift-weekly-template
export interface ShiftWeeklyTemplate {
  template_id: number
  kaipoke_cs_id: string
  weekday: number              // 0..6 (Sun..Sat)
  start_time: string           // 'HH:MM:SS'
  end_time: string             // 'HH:MM:SS'
  service_code: string
  required_staff_count: number
  two_person_work_flg: boolean
  judo_ido: string | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean
  staff_03_attend_flg: boolean
  staff_01_role_code: string | null
  staff_02_role_code: string | null
  staff_03_role_code: string | null
  active: boolean
  effective_from: string | null // 'YYYY-MM-DD'
  effective_to: string | null   // 'YYYY-MM-DD'
  is_biweekly: boolean | null
  nth_weeks: number[] | null    // [1..5]
}

// upsert の受け取り用（template_id は省略可）
export type ShiftWeeklyTemplateUpsert = Omit<
  ShiftWeeklyTemplate,
  'template_id'
> & { template_id?: number }

// shift へ展開するときに使うカラム（必要最小限）
export interface ShiftRow {
  kaipoke_cs_id: string
  shift_start_date: string      // 'YYYY-MM-DD'
  shift_start_time: string      // 'HH:MM:SS'
  shift_end_time: string        // 'HH:MM:SS'
  service_code: string
  required_staff_count: number
  two_person_work_flg: boolean
  judo_ido: string | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean
  staff_03_attend_flg: boolean
  staff_01_role_code: string | null
  staff_02_role_code: string | null
  staff_03_role_code: string | null
}
