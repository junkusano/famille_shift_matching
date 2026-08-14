export type RecurrenceTemplate = {
  weekday: number
  active: boolean
  effective_from: string | null
  effective_to: string | null
  is_biweekly: boolean | null
  nth_weeks: number[] | null
}

/**
 * 月内の週番号は「月初から 7 日単位」（1-7 日=第1週）で統一する。
 * 既存のテンプレート入力・旧プレビューがこの定義を使用しているため、
 * 月曜始まりの暦週には変更しない。
 */
export function nthWeekOfMonth(ymd: string): number {
  return Math.floor((Number(ymd.slice(8, 10)) - 1) / 7) + 1
}

export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

export function addDays(ymd: string, days: number): string {
  const date = new Date(`${ymd}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  )
}

export function normalizedNthWeeks(value: number[] | null): number[] {
  return [...new Set((value ?? []).filter((week) => Number.isInteger(week) && week >= 1 && week <= 5))]
}

/** The first template weekday on or after its explicitly configured effective date. */
export function firstScheduledDateOnOrAfter(effectiveFrom: string, weekday: number): string {
  const delta = (weekday - weekdayOf(effectiveFrom) + 7) % 7
  return addDays(effectiveFrom, delta)
}

export type RecurrenceDecision = { include: boolean; reason?: string }

/**
 * Recurrence priority is intentionally independent of the caller:
 * nth_weeks > biweekly > weekly. A historical matching service is the anchor
 * for biweekly templates; effective_from is only the documented first-run
 * anchor and is never replaced by a target-month boundary.
 */
export function shouldDeployTemplateOnDate(
  template: RecurrenceTemplate,
  ymd: string,
  previousServiceDate: string | null,
): RecurrenceDecision {
  if (!template.active || weekdayOf(ymd) !== template.weekday) return { include: false }
  if (template.effective_from && ymd < template.effective_from) return { include: false }
  if (template.effective_to && ymd > template.effective_to) return { include: false }

  const nthWeeks = normalizedNthWeeks(template.nth_weeks)
  if (nthWeeks.length > 0) {
    return { include: nthWeeks.includes(nthWeekOfMonth(ymd)) }
  }

  if (!template.is_biweekly) return { include: true }

  const anchor = previousServiceDate ??
    (template.effective_from ? firstScheduledDateOnOrAfter(template.effective_from, template.weekday) : null)
  if (!anchor) {
    return {
      include: false,
      reason: '隔週テンプレートには、過去の同一サービス日または effective_from が必要です',
    }
  }

  const elapsed = daysBetween(anchor, ymd)
  return { include: elapsed >= 0 && elapsed % 14 === 0 }
}
