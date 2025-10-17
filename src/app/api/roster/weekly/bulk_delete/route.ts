// /src/app/api/roster/weekly/templates/bulk_delete/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type DeleteBody =
  | { template_ids: number[] }
  | { kaipoke_cs_id: string; weekday?: number }

export async function POST(req: Request) {
  const body = (await req.json()) as DeleteBody

  let q = supabaseAdmin.from('shift_weekly_template').delete()

  if ('template_ids' in body) {
    if (!Array.isArray(body.template_ids) || body.template_ids.length === 0) {
      return NextResponse.json({ error: 'template_ids is empty' }, { status: 400 })
    }
    q = q.in('template_id', body.template_ids)
  } else if ('kaipoke_cs_id' in body) {
    q = q.eq('kaipoke_cs_id', body.kaipoke_cs_id)
    if (typeof body.weekday === 'number') q = q.eq('weekday', body.weekday)
  } else {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
