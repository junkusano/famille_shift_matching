// /src/app/api/roster/weekly/preview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate, ShiftRow } from '@/types/shift-weekly-template'

function dateRangeDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1)
  const end = new Date(y, m, 0)
  const days: string[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs')
  const month = searchParams.get('month') // YYYY-MM

  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }

  // テンプレート取得
  const { data: templates, error } = await supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .eq('kaipoke_cs_id', cs)
    .eq('active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 月内の日付列挙
  const days = dateRangeDays(month)

  // 週間テンプレート→候補展開（隔週/Nth週は簡易対応。必要なら強化可能）
  const cands: ShiftRow[] = []
  for (const d of days) {
    const dow = new Date(d + 'T00:00:00').getDay() // 0..6
    for (const t of (templates as ShiftWeeklyTemplate[])) {
      if (t.weekday !== dow) continue

      // BIWEEKLY / NTHWEEK は要件次第で追加ロジック
      if (t.is_biweekly === true) {
        // anchor が無い前提なので偶数週/奇数週の扱いは仕様決めが必要
        // ここでは一旦「毎週」に落とす（UI/SQLが決まったら実ロジックに更新）
      }
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

  // 既存シフトを取得して「重なり」判定を付ける（プレビュー用）
  const { data: existing, error: e2 } = await supabaseAdmin
    .from('shift')
    .select('kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time')
    .eq('kaipoke_cs_id', cs)
    .gte('shift_start_date', days[0])
    .lte('shift_start_date', days[days.length - 1])

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const overlaps = new Set<string>()
  for (const ex of existing ?? []) {
    const key = `${ex.kaipoke_cs_id}|${ex.shift_start_date}`
    // 同日の時間帯重なりをチェックしやすいようキー化して保存
    overlaps.add(key)
  }

  // とりあえず「同日既存あり」を目印に返す（フロントで詳細判定してもOK）
  const preview = cands.map(c => ({
    ...c,
    hasExistingSameDay: overlaps.has(`${c.kaipoke_cs_id}|${c.shift_start_date}`),
  }))

  return NextResponse.json({ items: preview })
}
