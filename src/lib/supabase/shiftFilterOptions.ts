// shift のフィルター選択肢を抽出する共通モジュール
// 保存場所の推奨：src/lib/supabase/shiftFilterOptions.ts

import type { ShiftData } from '@/types/shift';

export interface ShiftFilterOptions {
  dateOptions: string[];
  serviceOptions: string[];
  postalOptions: string[];
  nameOptions: string[];
  genderOptions: string[];
}

export const extractFilterOptions = (shifts: ShiftData[]): ShiftFilterOptions => {
  const sortAndUniq = (values: string[]) => [...new Set(values)].sort();

  return {
    dateOptions: sortAndUniq(shifts.map((s) => s.shift_start_date)),
    serviceOptions: sortAndUniq(shifts.map((s) => s.service_code)),
    postalOptions: sortAndUniq(shifts.map((s) => s.address)),
    nameOptions: sortAndUniq(shifts.map((s) => s.client_name)),
    genderOptions: sortAndUniq(shifts.map((s) => s.gender_request_name)),
  };
};
