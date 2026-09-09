import type { AutomationSchedule, AutomationTriggerType } from "@/lib/knowledge-automation/types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function fromJstParts(year: number, month: number, day: number, hours: number, minutes: number) {
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - JST_OFFSET_MS);
}

function jstParts(date: Date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function validTimes(schedule: AutomationSchedule) {
  return (schedule.times ?? []).filter((time) => TIME_PATTERN.test(time)).sort();
}

export function calculateAutomationNextRunAt(
  triggerType: AutomationTriggerType,
  schedule: AutomationSchedule,
  enabled: boolean,
  from = new Date()
): string | null {
  if (!enabled || triggerType === "event" || triggerType === "manual") return null;

  if (triggerType === "interval") {
    const minutes = Number(schedule.minutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1_440) return null;
    return new Date(from.getTime() + minutes * 60_000).toISOString();
  }

  const current = jstParts(from);
  if (triggerType === "daily") {
    for (const time of validTimes(schedule)) {
      const [hours, minutes] = time.split(":").map(Number);
      const candidate = fromJstParts(current.year, current.month, current.day, hours, minutes);
      if (candidate > from) return candidate.toISOString();
    }
    const first = validTimes(schedule)[0];
    if (!first) return null;
    const [hours, minutes] = first.split(":").map(Number);
    const tomorrow = fromJstParts(current.year, current.month, current.day + 1, hours, minutes);
    return tomorrow.toISOString();
  }

  const day = Number(schedule.day);
  const time = schedule.time;
  if (!Number.isInteger(day) || day < 1 || day > 31 || !time || !TIME_PATTERN.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  for (let monthOffset = 0; monthOffset <= 1; monthOffset += 1) {
    const monthDate = new Date(Date.UTC(current.year, current.month - 1 + monthOffset, 1));
    const year = monthDate.getUTCFullYear();
    const month = monthDate.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const candidate = fromJstParts(year, month, Math.min(day, lastDay), hours, minutes);
    if (candidate > from) return candidate.toISOString();
  }
  return null;
}
