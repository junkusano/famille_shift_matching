export const COMPANY_CAR_DISTANCE_INDEX_STAFF_NAMES = new Set([
  "佐藤美佐子",
  "片岡由美子",
  "小林千佳",
  "山岡幸洋",
]);

export function isCompanyCarDistanceIndexStaffName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
): boolean {
  return COMPANY_CAR_DISTANCE_INDEX_STAFF_NAMES.has(
    `${lastName ?? ""}${firstName ?? ""}`.replace(/\s/g, ""),
  );
}
