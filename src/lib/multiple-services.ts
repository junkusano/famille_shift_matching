export const MULTIPLE_SERVICE_PREFIX = "ms:";

export type MultipleServiceSource = {
  shift_id: string | number;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code?: string | null;
  client_name?: string | null;
  kaipoke_cs_id?: string | number | null;
  estimated_pay_amount?: number | null;
  multiple_service_group_id?: string | null;
  head_shift_id?: string | null;
};

export type MultipleServiceGroup<T extends MultipleServiceSource = MultipleServiceSource> = {
  kind: "multiple-service";
  id: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  spanMinutes: number;
  serviceMinutes: number;
  gapMinutes: number;
  estimatedPayAmount: number;
  shifts: T[];
  invalidReason: string | null;
};

export type MultipleServiceItem<T extends MultipleServiceSource = MultipleServiceSource> =
  | { kind: "single"; shift: T }
  | MultipleServiceGroup<T>;

export const toHm = (value?: string | null) => String(value ?? "").slice(0, 5);

export function timeToMinutes(value?: string | null) {
  const match = toHm(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMinutes(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;
  return Math.max(0, endMinutes - startMinutes);
}

function cleanClientName(value?: string | null) {
  return String(value ?? "").trim().replace(/[\s　]*様$/, "");
}

export function shortServiceName(value?: string | null) {
  const text = String(value ?? "").trim();
  if (!text) return "サービス";
  if (text.includes("身体")) return "身体";
  if (text.includes("家事") || text.includes("生活援助")) return "家事";
  if (text.includes("重度")) return "重度";
  if (text.includes("行動")) return "行動";
  if (text.includes("同行")) return "同行";
  if (text.includes("移動")) return "移動";
  return text;
}

export function multipleServiceTitle(shifts: MultipleServiceSource[]) {
  const clients = Array.from(
    new Set(shifts.map((shift) => cleanClientName(shift.client_name)).filter(Boolean)),
  );
  const services = Array.from(
    new Set(shifts.map((shift) => shortServiceName(shift.service_code)).filter(Boolean)),
  );
  const clientLabel = clients.length
    ? clients.map((name) => `${name}様`).join("・")
    : "利用者様";
  return `${clientLabel} ${services.join("・")} 複数サービス`.replace(/\s+/g, " ").trim();
}

export function multipleServiceGroupId(shift: MultipleServiceSource) {
  const value = shift.multiple_service_group_id ?? shift.head_shift_id ?? "";
  return value.startsWith(MULTIPLE_SERVICE_PREFIX) ? value : null;
}

export function buildMultipleServiceItems<T extends MultipleServiceSource>(shifts: T[]): MultipleServiceItem<T>[] {
  const grouped = new Map<string, T[]>();
  const singles: T[] = [];

  for (const shift of shifts) {
    const groupId = multipleServiceGroupId(shift);
    if (!groupId) {
      singles.push(shift);
      continue;
    }
    const key = `${shift.shift_start_date}::${groupId}`;
    const members = grouped.get(key) ?? [];
    members.push(shift);
    grouped.set(key, members);
  }

  const items: MultipleServiceItem<T>[] = singles.map((shift) => ({ kind: "single", shift }));

  for (const [key, members] of grouped) {
    members.sort((a, b) => toHm(a.shift_start_time).localeCompare(toHm(b.shift_start_time)));
    if (members.length < 2) {
      items.push({ kind: "single", shift: members[0] });
      continue;
    }

    const first = members[0];
    const last = members[members.length - 1];
    const start = timeToMinutes(first.shift_start_time);
    let end = timeToMinutes(last.shift_end_time);
    if (end < start) end += 24 * 60;
    const spanMinutes = Math.max(0, end - start);
    const serviceMinutes = members.reduce(
      (total, shift) => total + durationMinutes(shift.shift_start_time, shift.shift_end_time),
      0,
    );

    let invalidReason: string | null = null;
    for (let index = 1; index < members.length; index += 1) {
      const previousEnd = timeToMinutes(members[index - 1].shift_end_time);
      const currentStart = timeToMinutes(members[index].shift_start_time);
      const gap = currentStart - previousEnd;
      if (gap < 0) invalidReason = "構成シフトの時間が重複しています";
      if (gap > 120) invalidReason = "構成シフトの間隔が2時間を超えています";
    }

    items.push({
      kind: "multiple-service",
      id: key.split("::").slice(1).join("::"),
      date: first.shift_start_date,
      title: multipleServiceTitle(members),
      startTime: toHm(first.shift_start_time),
      endTime: toHm(last.shift_end_time),
      spanMinutes,
      serviceMinutes,
      gapMinutes: Math.max(0, spanMinutes - serviceMinutes),
      estimatedPayAmount: members.reduce(
        (total, shift) => total + (Number(shift.estimated_pay_amount) || 0),
        0,
      ),
      shifts: members,
      invalidReason,
    });
  }

  return items.sort((a, b) => {
    const left = a.kind === "single" ? a.shift : a.shifts[0];
    const right = b.kind === "single" ? b.shift : b.shifts[0];
    return (
      left.shift_start_date.localeCompare(right.shift_start_date) ||
      toHm(left.shift_start_time).localeCompare(toHm(right.shift_start_time))
    );
  });
}

export function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}分`;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}
