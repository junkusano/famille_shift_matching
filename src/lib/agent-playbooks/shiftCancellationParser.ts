const JST_TIME_ZONE = "Asia/Tokyo";

export type ShiftCancellationRequest = {
  date: string;
  startTime: string | null;
  endTime: string | null;
  timeApproximate?: boolean;
};

function normalizeDigits(text: string) {
  return text
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ":")
    .replace(/[―−]/g, "-");
}

function jstDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function shiftDate(reference: { year: number; month: number; day: number }, offset: number) {
  const date = new Date(Date.UTC(reference.year, reference.month - 1, reference.day + offset));
  return toYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function resolveDate(params: {
  explicitYear: number | null;
  explicitMonth: number | null;
  day: number;
  reference: { year: number; month: number; day: number };
}) {
  if (params.explicitYear && params.explicitMonth) {
    return toYmd(params.explicitYear, params.explicitMonth, params.day);
  }

  if (params.explicitMonth) {
    let year = params.reference.year;
    const ymd = toYmd(year, params.explicitMonth, params.day);
    const referenceYmd = toYmd(params.reference.year, params.reference.month, params.reference.day);
    if (ymd && referenceYmd && ymd < referenceYmd) year += 1;
    return toYmd(year, params.explicitMonth, params.day);
  }

  let { year, month } = params.reference;
  if (params.day < params.reference.day) ({ year, month } = nextMonth(year, month));
  return toYmd(year, month, params.day);
}

function toTime(hourText: string, minuteText: string | undefined) {
  const hour = Number(hourText);
  const minute = Number(minuteText ?? "0");
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function extractTime(segment: string): { startTime: string | null; endTime: string | null; timeApproximate: boolean } {
  const timeApproximate = /(?:頃|ごろ|ぐらい|くらい|前後)/.test(segment);
  const range = /(\d{1,2})\s*(?::|時)\s*(\d{1,2})?\s*分?\s*(?:-|–|—|〜|～|~|から)\s*(\d{1,2})\s*(?::|時)\s*(\d{1,2})?\s*分?/.exec(segment);
  if (range) {
    return {
      startTime: toTime(range[1], range[2]),
      endTime: toTime(range[3], range[4]),
      timeApproximate: false,
    };
  }

  const single = /(\d{1,2})\s*(?::|時)\s*(\d{1,2})?\s*分?/.exec(segment);
  return single
    ? { startTime: toTime(single[1], single[2]), endTime: null, timeApproximate }
    : { startTime: null, endTime: null, timeApproximate: false };
}

export function parseShiftTimeRange(text: string) {
  return extractTime(normalizeDigits(text));
}

export function containsShiftCancellationIntent(text: string) {
  const normalized = normalizeDigits(text).replace(/\s+/g, "");
  return /(キャンセル|中止|取消|取り消|削除)/.test(normalized) && /(シフト|支援|サービス|訪問)/.test(normalized);
}

export function parseShiftDateTimeRequests(texts: string[], referenceDate: Date): ShiftCancellationRequest[] {
  const reference = jstDateParts(referenceDate);
  const parsed: ShiftCancellationRequest[] = [];
  const datePattern = /(?:(\d{4})\s*年\s*)?(?:(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})\s*日?|(\d{1,2})\s*日)/g;
  const relativeDatePattern = /今日|本日|明日|あした|翌日|明後日|あさって/g;
  let lastDate: string | null = null;

  for (const originalText of texts) {
    let text = normalizeDigits(originalText);
    // 月の見出しに続く「3(土)」「24(土)」を、同じ月の日付として扱う。
    const monthHeading = /(?:^|\n)\s*(\d{1,2})月(?:利用|の利用)/.exec(text);
    if (monthHeading) {
      text = text.replace(/(^|\n)(\s*)(\d{1,2})(?=[（(][月火水木金土日](?:曜日)?[）)])/g,
        (_, line, space, day) => line + space + monthHeading[1] + '月' + day + '日');
    }
    const matches = [
      ...Array.from(text.matchAll(datePattern)).map((match) => ({
        index: match.index ?? 0,
        length: match[0].length,
        date: resolveDate({
          explicitYear: match[1] ? Number(match[1]) : null,
          explicitMonth: match[2] ? Number(match[2]) : null,
          day: Number(match[3] ?? match[4]),
          reference,
        }),
      })),
      ...Array.from(text.matchAll(relativeDatePattern)).map((match) => ({
        index: match.index ?? 0,
        length: match[0].length,
        date: shiftDate(reference, /^(?:今日|本日)$/.test(match[0]) ? 0 : /^(?:明後日|あさって)$/.test(match[0]) ? 2 : 1),
      })),
    ].sort((a, b) => a.index - b.index);

    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const date = match.date;
      if (!date) continue;
      lastDate = date;

      const segmentStart = match.index + match.length;
      const segmentEnd = matches[index + 1]?.index ?? text.length;
      const { startTime, endTime, timeApproximate } = extractTime(text.slice(segmentStart, segmentEnd));
      parsed.push({ date, startTime, endTime, ...(timeApproximate ? { timeApproximate: true } : {}) });
    }

    if (matches.length === 0 && lastDate) {
      const { startTime, endTime, timeApproximate } = extractTime(text);
      if (startTime) parsed.push({ date: lastDate, startTime, endTime, ...(timeApproximate ? { timeApproximate: true } : {}) });
    }
  }

  const byDate = new Map<string, ShiftCancellationRequest[]>();
  for (const request of parsed) {
    const current = byDate.get(request.date) ?? [];
    current.push(request);
    byDate.set(request.date, current);
  }

  const result: ShiftCancellationRequest[] = [];
  for (const [date, requests] of byDate) {
    const timed = requests.filter((request) => request.startTime);
    const selected = timed.length > 0 ? timed : [{ date, startTime: null, endTime: null }];
    for (const request of selected) {
      if (!result.some((item) => item.date === request.date && item.startTime === request.startTime && item.endTime === request.endTime && item.timeApproximate === request.timeApproximate)) {
        result.push(request);
      }
    }
  }

  return result.sort((a, b) => `${a.date} ${a.startTime ?? ""}`.localeCompare(`${b.date} ${b.startTime ?? ""}`));
}

export function parseShiftCancellationRequests(texts: string[], referenceDate: Date): ShiftCancellationRequest[] {
  return parseShiftDateTimeRequests(
    texts.filter((text) => containsShiftCancellationIntent(text)),
    referenceDate,
  );
}
