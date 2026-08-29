export type WeeklyShiftServiceContextRow = {
  templateId: number | null;
  weekday: number | null;
  weekdayJp: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceCode: string | null;
  planServiceCategory: string | null;
  planDisplayName: string | null;
  requiredStaffCount: number | null;
  isBiweekly: boolean | null;
  nthWeeks: number[] | null;
};

export type WeeklyShiftServiceContext = {
  text: string;
  weeklyShiftCount: number;
  weeklyShiftIds: number[];
  serviceContentCount: number;
};

function formatTime(value: string | null): string {
  return String(value ?? "").trim().slice(0, 5);
}

function formatWeekday(row: WeeklyShiftServiceContextRow): string {
  if (row.weekdayJp?.trim()) return `${row.weekdayJp.trim()}曜日`;
  return row.weekday === null ? "曜日未設定" : `曜日番号${row.weekday}`;
}

function formatFrequency(row: WeeklyShiftServiceContextRow): string {
  if (row.nthWeeks?.length) return `第${row.nthWeeks.join("・")}週`;
  if (row.isBiweekly) return "隔週";
  return "毎週";
}

export function weeklyShiftServiceLabel(row: WeeklyShiftServiceContextRow): string {
  return (
    row.planServiceCategory?.trim() ||
    row.planDisplayName?.trim() ||
    row.serviceCode?.trim() ||
    "サービス区分未設定"
  );
}

/**
 * 週間シフトをAIへ渡す根拠テキストに変換する。
 * DBの登録値だけを使用し、援助内容を推測して補わない。
 */
export function buildWeeklyShiftServiceContext(
  rows: WeeklyShiftServiceContextRow[],
): WeeklyShiftServiceContext {
  const orderedRows = [...rows].sort((a, b) => {
    const weekdayDiff = (a.weekday ?? 99) - (b.weekday ?? 99);
    if (weekdayDiff !== 0) return weekdayDiff;
    return formatTime(a.startTime).localeCompare(formatTime(b.startTime), "ja");
  });

  const lines = orderedRows.map((row) => {
    const details = [
      `シフトID: ${row.templateId ?? "未設定"}`,
      `曜日: ${formatWeekday(row)}`,
      `時間: ${formatTime(row.startTime) || "未設定"}〜${formatTime(row.endTime) || "未設定"}`,
      `頻度: ${formatFrequency(row)}`,
      `サービス区分: ${weeklyShiftServiceLabel(row)}`,
      row.planDisplayName?.trim() && row.planDisplayName.trim() !== weeklyShiftServiceLabel(row)
        ? `表示名: ${row.planDisplayName.trim()}`
        : "",
      row.serviceCode?.trim() && row.serviceCode.trim() !== weeklyShiftServiceLabel(row)
        ? `サービスコード: ${row.serviceCode.trim()}`
        : "",
      row.requiredStaffCount && row.requiredStaffCount > 1
        ? `必要人数: ${row.requiredStaffCount}名`
        : "",
    ].filter(Boolean);

    return `- ${details.join(" / ")}`;
  });

  return {
    text: lines.length
      ? `【週間シフト（実際の登録内容）】\n${lines.join("\n")}`
      : "",
    weeklyShiftCount: orderedRows.length,
    weeklyShiftIds: orderedRows
      .map((row) => row.templateId)
      .filter((id): id is number => typeof id === "number"),
    serviceContentCount: orderedRows.filter(
      (row) => weeklyShiftServiceLabel(row) !== "サービス区分未設定",
    ).length,
  };
}
