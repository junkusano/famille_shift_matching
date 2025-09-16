// /src/app/api/shifts/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

function getMonthRange(yyyyMm: string) {
  // yyyy-MM → [startDate, nextMonthStartDate]
  const [y, m] = yyyyMm.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1))
  const next = new Date(Date.UTC(y, m, 1))
  const toIso = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD
  return { start: toIso(start), next: toIso(next) }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const kaipokeCsId = searchParams.get('kaipoke_cs_id')
  const month = searchParams.get('month')

  console.info('[shifts][GET] kaipoke_cs_id=', kaipokeCsId, ' month=', month)

  if (!kaipokeCsId || !month) {
    return NextResponse.json({ error: 'kaipoke_cs_id and month are required' }, { status: 400 })
  }

  const { start, next } = getMonthRange(month)

  const { data, error } = await supabaseAdmin
    .from('shift_csinfo_postalname_view')
    .select(
      `
      shift_id,
      shift_start_date,
      shift_start_time,
      shift_end_time,
      service_code,
      kaipoke_cs_id,
      name,
      staff_01_user_id,
      staff_02_user_id,
      staff_03_user_id,
      staff_02_attend_flg,
      staff_03_attend_flg,
      required_staff_count,
      two_person_work_flg,
      judo_ido
    `
    )
    .eq('kaipoke_cs_id', kaipokeCsId)
    .gte('shift_start_date', start) // ★date に LIKE は不可。範囲で取る
    .lt('shift_start_date', next)
    .order('shift_start_date', { ascending: true })
    .order('shift_start_time', { ascending: true })

  if (error) {
    console.error('[shifts][GET] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = Array.isArray(data) ? data : []
  console.info('[shifts][GET] count=', rows.length)
  return NextResponse.json(rows, { status: 200 })
}

type ShiftUpdate = {
  shift_id: number | string
  staff_01_user_id?: string | null
  staff_02_user_id?: string | null
  staff_03_user_id?: string | null
  staff_02_attend_flg?: boolean
  staff_03_attend_flg?: boolean
  required_staff_count?: number
  two_person_work_flg?: boolean
  judo_ido?: string | null
}

export async function PUT(req: Request) {
  const body: ShiftUpdate = await req.json()
  const { shift_id, ...updatedFields } = body

  console.info('[shifts][PUT] shift_id=', shift_id, ' payload=', updatedFields)

  if (!shift_id) {
    return NextResponse.json({ error: 'shift_id is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift')
    .update(updatedFields)
    .eq('shift_id', shift_id)
    .select()
    .single()

  if (error) {
    console.error('[shifts][PUT] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
