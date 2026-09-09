// /src/app/api/roster/weekly/templates/route.ts の修正箇所

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate } from '@/types/shift-weekly-template'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs')
  const activeOnly = searchParams.get('active') !== 'false'
  
  // ★ ログ追加: START
  console.log('[weekly/templates][GET] START query =', { cs, activeOnly })

  let q = supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (cs) q = q.eq('kaipoke_cs_id', cs)
  if (activeOnly) q = q.eq('active', true)

  const { data, error } = await q
  if (error) {
    // ★ ログ追加: ERROR
    console.error('[weekly/templates][GET] ERROR:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ★ ログ追加: templates count
  console.log('[weekly/templates][GET] templates count =', data.length)
  console.log('[weekly/templates][GET] END OK')
  
  return NextResponse.json(data as ShiftWeeklyTemplate[])
}