// src/lib/supabase/shiftFilterOptions.ts

export interface ShiftFilterOptions {
  dateOptions: string[];
  serviceOptions: string[];
  postalOptions: { postal_code_3: string; district: string }[];
  nameOptions: string[];
  genderOptions: string[];
}

export function extractFilterOptions(
  shifts: {
    shift_start_date: string;
    service_code: string;
    postal_code_3: string;
    client_name: string;
    gender_request_name: string;
  }[],
  postalDistricts: { postal_code_3: string; district: string }[] = []
): ShiftFilterOptions {
  const dateSet = new Set<string>();
  const serviceSet = new Set<string>();
  const nameSet = new Set<string>();
  const genderSet = new Set<string>();
  const postalSet = new Set<string>();

  for (const s of shifts) {
    dateSet.add(s.shift_start_date);
    serviceSet.add(s.service_code);
    nameSet.add(s.client_name);
    genderSet.add(s.gender_request_name);
    postalSet.add(s.postal_code_3);
  }

  const postalOptions = postalDistricts.filter(p => postalSet.has(p.postal_code_3));

  return {
    dateOptions: Array.from(dateSet).sort(),
    serviceOptions: Array.from(serviceSet).sort(),
    postalOptions: postalOptions.sort((a, b) => a.postal_code_3.localeCompare(b.postal_code_3)),
    nameOptions: Array.from(nameSet).sort(),
    genderOptions: Array.from(genderSet).sort(),
  };
}
