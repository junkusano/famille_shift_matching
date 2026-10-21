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

export type MonthlyMeetingAlertKey = {
  targetYm: string;
  userId: string;
};

/**
 * alert_log.shift_id に保存している月例会議アラートのキーを分解する。
 * 想定外の文字列は、別種類のアラートを誤って解消しないよう null を返す。
 */
export function parseMonthlyMeetingAlertKey(
  shiftId: string | null | undefined,
): MonthlyMeetingAlertKey | null {
  const match = String(shiftId ?? "").match(
    /^monthly_meeting:unchecked:(\d{4}-\d{2}):([^:]+)$/,
  );
  if (!match) return null;

  return { targetYm: match[1], userId: match[2] };
}

/**
 * 既に作成済みの月例会議アラートを自動解消してよいか判定する。
 * 登録日不明の場合は従来どおり対象を残し、誤って消さない。
 */
export function shouldResolveMonthlyMeetingAlert(args: {
  entryDateOriginal: string | null | undefined;
  entryDateLatest: string | null | undefined;
  targetYm: string;
}): boolean {
  const entryDate = String(args.entryDateLatest || args.entryDateOriginal || "").trim();
  if (!entryDate) return false;

  return !isMeetingMonthEligible(
    args.entryDateOriginal,
    args.entryDateLatest,
    args.targetYm,
  );
}
