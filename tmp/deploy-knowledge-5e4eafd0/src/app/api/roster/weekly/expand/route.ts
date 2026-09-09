//src/app/api/roster/weekly/expand/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import { buildCandidates, loadDeploymentInput, shiftRowFromCandidate } from '@/lib/roster/weeklyDeployment'
import type { ShiftRow } from '@/types/shift-weekly-template'

type ConflictPolicy = 'SKIP' | 'FILL_EMPTY' | 'OVERWRITE'

interface ExpandBody {
  cs: string
  month: string // 'YYYY-MM'
  policy?: ConflictPolicy
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

  const { templates, existing, previousDates } = await loadDeploymentInput(cs, month)

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

  // 個別展開・一斉展開と同じ隔週／第n週判定を使用する。
  const { candidates: candidateRows, warnings } = buildCandidates(month, templates, previousDates)
  const cands: ShiftRow[] = candidateRows.map(shiftRowFromCandidate)

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

  if (inserts.length === 0) return NextResponse.json({ inserted: 0, warnings })

  const { error: insErr } = await supabaseAdmin.from('shift').insert(inserts)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ inserted: inserts.length, warnings })
}
