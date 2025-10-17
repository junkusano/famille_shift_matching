//src/app/api/roster/weekly/expand/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate, ShiftRow } from '@/types/shift-weekly-template'

type ConflictPolicy = 'SKIP' | 'FILL_EMPTY' | 'OVERWRITE'

interface ExpandBody {
  cs: string
  month: string // 'YYYY-MM'
  policy?: ConflictPolicy
}

// 'YYYY-MM' を厳密に数値へ
function parseMonth(month: string): { y: number; m: number } {
  const [ys, ms] = month.split('-')
  const y = Number.parseInt(ys, 10)
  const m = Number.parseInt(ms, 10)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('invalid month format')
  }
  return { y, m }
}

function dateRangeDays(month: string): string[] {
  const { y, m } = parseMonth(month)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0) // 当月末日
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function timeToMinutes(hms: string): number {
  const [hh = '0', mm = '0', ss = '0'] = hms.split(':')
  const h = Number.parseInt(hh, 10) || 0
  const m = Number.parseInt(mm, 10) || 0
  const s = Number.parseInt(ss, 10) || 0
  return h * 60 + m + Math.floor(s / 60)
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = timeToMinutes(aStart)
  const ae = timeToMinutes(aEnd)
  const bs = timeToMinutes(bStart)
  const be = timeToMinutes(bEnd)
  return as < be && ae > bs
}

export async function POST(req: Request) {
  const { cs, month, policy = 'FILL_EMPTY' } = (await req.json()) as ExpandBody

  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }

  // テンプレート読み込み
  const { data: templates, error } = await supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .eq('kaipoke_cs_id', cs)
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const days = dateRangeDays(month)

  // 既存シフト（重なりチェック用）
  const { data: existing, error: e2 } = await supabaseAdmin
    .from('shift')
    .select('shift_start_date,shift_start_time,shift_end_time')
    .eq('kaipoke_cs_id', cs)
    .gte('shift_start_date', days[0])
    .lte('shift_start_date', days[days.length - 1])

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // 既存→日付マップ
  const existingByDate = new Map<string, { start: string; end: string }[]>()
  for (const z of existing ?? []) {
    const k = z.shift_start_date as string
    const arr = existingByDate.get(k) ?? []
    arr.push({
      start: z.shift_start_time as string,
      end: z.shift_end_time as string,
    })
    existingByDate.set(k, arr)
  }

  // 候補生成（隔週/Nth週は簡易対応。詳細ルールは後で拡張可）
  const cands: ShiftRow[] = []
  for (const d of days) {
    const dow = new Date(d + 'T00:00:00').getDay()
    for (const t of (templates as ShiftWeeklyTemplate[])) {
      if (t.weekday !== dow) continue
      if (t.nth_weeks && t.nth_weeks.length > 0) {
        const nth = Math.floor((Number(d.slice(8, 10)) - 1) / 7) + 1
        if (!t.nth_weeks.includes(nth)) continue
      }
      cands.push({
        kaipoke_cs_id: t.kaipoke_cs_id,
        shift_start_date: d,
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
      })
    }
  }

  let inserts: ShiftRow[] = []

  if (policy === 'OVERWRITE') {
    // 主キー不要の条件削除：候補ごとに重なり行を delete
    for (const c of cands) {
      const { error: delErr } = await supabaseAdmin
        .from('shift')
        .delete()
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', c.shift_start_date)
        .lt('shift_start_time', c.shift_end_time)
        .gt('shift_end_time', c.shift_start_time)

      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    }
    inserts = cands
  } else {
    // SKIP / FILL_EMPTY: 重なりがある候補を除外
    inserts = cands.filter(c => {
      const exs = existingByDate.get(c.shift_start_date) ?? []
      return !exs.some(ex => overlaps(c.shift_start_time, c.shift_end_time, ex.start, ex.end))
    })
  }

  if (inserts.length === 0) return NextResponse.json({ inserted: 0 })

  const { error: insErr } = await supabaseAdmin.from('shift').insert(inserts)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ inserted: inserts.length })
}
