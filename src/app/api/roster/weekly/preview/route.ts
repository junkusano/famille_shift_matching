// src/app/api/roster/weekly/preview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate, ShiftRow } from '@/types/shift-weekly-template'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// 既存シフトの最小限カラム
interface ExistingShift {
  shift_start_date: string
  shift_start_time: string
  shift_end_time: string
  kaipoke_cs_id: string
}

// ---- helpers ----
const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
const toHM = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m!, 0)
  return { start, end, startStr: fmtDate(start), endStr: fmtDate(end) }
}
function* eachDay(start: Date, end: Date): Generator<Date> {
  const cur = new Date(start)
  while (cur <= end) {
    yield new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
}
const nthOfMonth = (d: Date) => Math.floor((d.getDate() - 1) / 7) + 1
const isBiweeklyHit = (date: Date, effectiveFrom: string | null): boolean => {
  const anchor = effectiveFrom ? new Date(effectiveFrom + 'T00:00:00') : date
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000)
  const weeks = Math.floor(diffDays / 7)
  return weeks % 2 === 0
}

async function handlePreview(cs: string, month: string) {
  // ===== ログ: リクエスト受領 =====
  console.log('[weekly/preview] START', { cs, month })

  // 1) テンプレ取得
  console.log('[weekly/preview] fetch templates where kaipoke_cs_id =', cs)
  const tplRes = await supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .eq('kaipoke_cs_id', cs)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (tplRes.error) {
    console.error('[weekly/preview] templates error:', tplRes.error)
    return NextResponse.json({ error: tplRes.error.message }, { status: 500 })
  }
  const templates: ShiftWeeklyTemplate[] = (tplRes.data ?? []) as ShiftWeeklyTemplate[]
  console.log('[weekly/preview] templates count =', templates.length)
  if (templates.length > 0) {
    const byWeekday: Record<number, number> = {}
    for (const t of templates) byWeekday[t.weekday] = (byWeekday[t.weekday] ?? 0) + 1
    console.log('[weekly/preview] templates by weekday =', byWeekday)
  }

  // 2) 対象月の既存シフト
  const { start, end, startStr, endStr } = monthRange(month)
  console.log('[weekly/preview] month range =', { startStr, endStr })

  const existRes = await supabaseAdmin
    .from('shift')
    .select('shift_start_date,shift_start_time,shift_end_time,kaipoke_cs_id')
    .eq('kaipoke_cs_id', cs)
    .gte('shift_start_date', startStr)
    .lte('shift_start_date', endStr)

  if (existRes.error) {
    console.error('[weekly/preview] existing shifts error:', existRes.error)
    return NextResponse.json({ error: existRes.error.message }, { status: 500 })
  }
  const existing: ExistingShift[] = (existRes.data ?? []) as ExistingShift[]
  console.log('[weekly/preview] existing shift count =', existing.length)

  // 3) 候補生成（スキップ理由も集計）
  let pushCount = 0
  const skip = {
    weekday: 0, // 使わないが統一感のため
    outOfRange: 0,
    biweekly: 0,
    nth: 0,
  }

  const rows: (ShiftRow & { conflict: boolean; weekday: number })[] = []

  for (const date of eachDay(start, end)) {
    const dow = date.getDay()
    const nth = nthOfMonth(date)
    const ymd = fmtDate(date)

    for (const t of templates) {
      if (t.weekday !== dow) continue
      if (t.effective_from && ymd < t.effective_from) {
        skip.outOfRange++
        continue
      }
      if (t.effective_to && ymd > t.effective_to) {
        skip.outOfRange++
        continue
      }
      if (t.is_biweekly === true && !isBiweeklyHit(date, t.effective_from)) {
        skip.biweekly++
        continue
      }
      if (t.nth_weeks && t.nth_weeks.length > 0 && !t.nth_weeks.includes(nth)) {
        skip.nth++
        continue
      }

      const cand: ShiftRow = {
        kaipoke_cs_id: t.kaipoke_cs_id,
        shift_start_date: ymd,
        shift_start_time: t.start_time,
        shift_end_time: t.end_time,
        service_code: t.service_code,
        required_staff_count: t.required_staff_count,
        two_person_work_flg: t.two_person_work_flg,
        judo_ido: t.judo_ido,
        staff_01_user_id: t.staff_01_user_id,
        staff_02_user_id: t.staff_02_user_id,
        staff_03_user_id: t.staff_03_user_id,
        staff_02_attend_flg: t.staff_02_attend_flg,
        staff_03_attend_flg: t.staff_03_attend_flg,
        staff_01_role_code: t.staff_01_role_code,
        staff_02_role_code: t.staff_02_role_code,
        staff_03_role_code: t.staff_03_role_code,
      }

      const s1 = toHM(cand.shift_start_time)
      const e1 = toHM(cand.shift_end_time)

      const conflict = existing.some(
        (z) =>
          z.shift_start_date === cand.shift_start_date &&
          toHM(z.shift_start_time) < e1 &&
          toHM(z.shift_end_time) > s1
      )

      rows.push({ ...cand, conflict, weekday: dow })
      pushCount++
    }
  }

  rows.sort((a, b) =>
    a.shift_start_date === b.shift_start_date
      ? toHM(a.shift_start_time) - toHM(b.shift_start_time)
      : a.shift_start_date < b.shift_start_date
        ? -1
        : 1
  )

  // ===== ログ: 集計結果 =====
  console.log('[weekly/preview] generated rows =', rows.length, ' (pushed:', pushCount, ')')
  console.log('[weekly/preview] skip summary =', skip)
  if (rows.length > 0) {
    // ログが大きくなりすぎないように先頭5件だけ
    console.log('[weekly/preview] sample rows(<=5) =', rows.slice(0, 5))
    const conflicts = rows.filter((r) => r.conflict).length
    console.log('[weekly/preview] conflict count =', conflicts)
  }

  console.log('[weekly/preview] END OK')
  return NextResponse.json({ rows }, { status: 200 })
}

// --- GET: /api/roster/weekly/preview?cs=...&month=YYYY-MM ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs')
  const month = searchParams.get('month')
  console.log('[weekly/preview][GET] query =', { cs, month })
  if (!cs || !month) {
    console.warn('[weekly/preview][GET] missing params')
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }
  return handlePreview(cs, month)
}

// --- POST: body { cs, month } ---
export async function POST(req: Request) {
  let body: Partial<{ cs: string; month: string }>
  try {
    body = (await req.json()) as Partial<{ cs: string; month: string }>
  } catch {
    body = {}
  }
  const { cs, month } = body
  console.log('[weekly/preview][POST] body =', body)
  if (!cs || !month) {
    console.warn('[weekly/preview][POST] missing params')
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }
  return handlePreview(cs, month)
}
