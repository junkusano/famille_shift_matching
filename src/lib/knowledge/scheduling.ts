import type { KnowledgeSource } from "@/lib/knowledge/types";

export function calculateNextRunAt(source: KnowledgeSource, from = new Date()): string | null {
  if (!source.enabled || source.sync_frequency === "manual") return null;
  const next = new Date(from);
  if (source.sync_frequency === "hourly") {
    next.setUTCMinutes(next.getUTCMinutes() + 60, 0, 0);
    return next.toISOString();
  }

  const time = typeof source.schedule.time === "string" ? source.schedule.time : "06:30";
  const [hours, minutes] = time.split(":").map(Number);
  const jstOffsetMs = 9 * 60 * 60 * 1_000;
  const jst = new Date(from.getTime() + jstOffsetMs);
  const candidate = new Date(Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    Number.isFinite(hours) ? hours : 6,
    Number.isFinite(minutes) ? minutes : 30
  ) - jstOffsetMs);

  if (source.sync_frequency === "daily") {
    if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);
  } else if (source.sync_frequency === "weekly") {
    const targetDay = typeof source.schedule.dayOfWeek === "number" ? source.schedule.dayOfWeek : 1;
    const delta = (targetDay - jst.getUTCDay() + 7) % 7;
    candidate.setUTCDate(candidate.getUTCDate() + delta);
    if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 7);
  } else {
    const targetDay = typeof source.schedule.day === "number" ? source.schedule.day : 2;
    candidate.setUTCDate(targetDay);
    if (candidate <= from) candidate.setUTCMonth(candidate.getUTCMonth() + 1);
  }
  return candidate.toISOString();
}

