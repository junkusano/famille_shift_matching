export type RegularShiftCandidate = {
  weekly_shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string | null;
  client_name: string | null;
  recurring_label: string;
  requested: boolean;
};

export function regularStartMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((out, part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
    return out;
  }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const offset = day <= 20 ? 2 : 3;
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function minutes(time: string | null | undefined): number {
  const [hours, mins] = String(time ?? '').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(mins) ? mins : 0);
}

export function timeOverlaps(
  a: { shift_start_time: string; shift_end_time: string },
  b: { shift_start_time: string; shift_end_time: string },
): boolean {
  const aStart = minutes(a.shift_start_time);
  const bStart = minutes(b.shift_start_time);
  const aEnd = minutes(a.shift_end_time) <= aStart ? minutes(a.shift_end_time) + 1440 : minutes(a.shift_end_time);
  const bEnd = minutes(b.shift_end_time) <= bStart ? minutes(b.shift_end_time) + 1440 : minutes(b.shift_end_time);
  return aStart < bEnd && bStart < aEnd;
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
