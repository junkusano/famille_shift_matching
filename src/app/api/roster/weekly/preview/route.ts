// /src/app/api/roster/weekly/preview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate, ShiftRow } from '@/types/shift-weekly-template'

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  // 1) テンプレ取得（csのみ）
  const tplRes = await supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .eq('kaipoke_cs_id', cs)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (tplRes.error) {
    return NextResponse.json({ error: tplRes.error.message }, { status: 500 })
  }
  const templates = (tplRes.data ?? []) as ShiftWeeklyTemplate[]
  if (templates.length === 0) {
    return NextResponse.json({ rows: [] }, { status: 200 })
  }

  // 2) 対象月の既存シフト（衝突チェック用）
  const { start, end, startStr, endStr } = monthRange(month)
  const existRes = await supabaseAdmin
    .from('shift')
    .select('shift_start_date,shift_start_time,shift_end_time,kaipoke_cs_id')
    .eq('kaipoke_cs_id', cs)
    .gte('shift_start_date', startStr)
    .lte('shift_start_date', endStr)

  if (existRes.error) {
    return NextResponse.json({ error: existRes.error.message }, { status: 500 })
  }
  const existing = existRes.data ?? []

  // 3) 候補生成
  const rows: (ShiftRow & { conflict: boolean; weekday: number })[] = []
  for (const date of eachDay(start, end)) {
    const dow = date.getDay()
    const nth = nthOfMonth(date)
    const ymd = fmtDate(date)

    for (const t of templates) {
      if (t.weekday !== dow) continue
      if (t.effective_from && ymd < t.effective_from) continue
      if (t.effective_to && ymd > t.effective_to) continue
      if (t.is_biweekly === true && !isBiweeklyHit(date, t.effective_from)) continue
      if (t.nth_weeks && t.nth_weeks.length > 0 && !t.nth_weeks.includes(nth)) continue

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
        (z: any) =>
          z.shift_start_date === cand.shift_start_date &&
          toHM(z.shift_start_time) < e1 &&
          toHM(z.shift_end_time) > s1
      )

      rows.push({ ...cand, conflict, weekday: dow })
    }
  }

  rows.sort((a, b) =>
    a.shift_start_date === b.shift_start_date
      ? toHM(a.shift_start_time) - toHM(b.shift_start_time)
      : a.shift_start_date < b.shift_start_date ? -1 : 1
  )

  return NextResponse.json({ rows }, { status: 200 })
}

// --- GET: /api/roster/weekly/preview?cs=...&month=YYYY-MM ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs')
  const month = searchParams.get('month')

  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }

  return handlePreview(cs, month)
}

// --- POST: body { cs, month } でも同じ動作にしておく ---
export async function POST(req: Request) {
  const { cs, month } = await req.json().catch(() => ({}))
  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }
  return handlePreview(cs, month)
}
