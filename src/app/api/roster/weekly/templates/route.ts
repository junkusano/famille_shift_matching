// /src/app/api/roster/weekly/templates/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate } from '@/types/shift-weekly-template'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs')
  const activeOnly = searchParams.get('active') !== 'false'

  let q = supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (cs) q = q.eq('kaipoke_cs_id', cs)
  if (activeOnly) q = q.eq('active', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data as ShiftWeeklyTemplate[])
}
