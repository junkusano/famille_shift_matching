export function isMeetingMonthEligible(
  entryDateOriginal: string | null | undefined,
  entryDateLatest: string | null | undefined,
  targetYm?: string,
): boolean {
  if (!targetYm) return true;

  const entryDate = String(entryDateLatest || entryDateOriginal || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return true;
  if (!/^\d{4}-\d{2}$/.test(targetYm)) return true;

  const [year, month] = targetYm.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return entryDate <= monthEnd;
}
