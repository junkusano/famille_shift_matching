export type Application = { provider: string; state: string };
export type ShiftState = { shift_start_date?: unknown; shift_start_time?: unknown; [key: string]: unknown };
export function canRecruit(shift: ShiftState, now = Date.now()): boolean {
  const start = Date.parse(String(shift.shift_start_date) + "T" + String(shift.shift_start_time).slice(0, 5) + ":00+09:00");
  return Number.isFinite(start) && start - now >= 2 * 60 * 60 * 1000;
}
export function activeApplications(applications: Application[]): Application[] {
  return applications.filter(a => a.state === "applied" || a.state === "confirmed");
}
/** 既存のmanager/admin枠が残っていれば募集中。同行枠は数えない。 */
export function staffAssigned(shift: ShiftState, roles: ReadonlyMap<string, string>): boolean {
  const ids = [shift.staff_01_user_id, shift.staff_02_attend_flg === true ? null : shift.staff_02_user_id, shift.staff_03_attend_flg === true ? null : shift.staff_03_user_id]
    .filter((id): id is string => typeof id === "string" && !!id.trim() && id !== "-");
  return ids.length > 0 && !ids.some(id => ["manager", "admin"].includes(roles.get(id) ?? ""));
}
export function desiredAction(input: {provider: string; status: string; applications: Application[]; shift: ShiftState | null; assigned: boolean; manualStop: boolean; now?: number}): "close" | "open" | "hold" {
  const active = activeApplications(input.applications);
  // 媒体自身の応募を、募集同期が不採用にしてはいけない。
  if (active.some(a => a.provider === input.provider)) return "hold";
  if (active.length || !input.shift || input.assigned || input.manualStop || input.status === "募集なし") return "close";
  return input.status === "募集中" && canRecruit(input.shift, input.now) ? "open" : "hold";
}
