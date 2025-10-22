// /src/app/api/roster/weekly/templates/bulk_upsert/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplateUpsert } from '@/types/shift-weekly-template'

export async function POST(req: Request) {
  const payload = (await req.json()) as ShiftWeeklyTemplateUpsert[]

  if (!Array.isArray(payload) || payload.length === 0) {
    return NextResponse.json({ error: 'empty payload' }, { status: 400 })
  }

  // onConflict で (cs, weekday, start_time) をキーとして upsert
  const { error } = await supabaseAdmin
    .from('shift_weekly_template')
    .upsert(payload, {
      onConflict: 'kaipoke_cs_id,weekday,start_time,required_staff_count',
      ignoreDuplicates: false,
    })
    // .select() を付けなければ最小返却（minimal）
    // .select() // ←返り値が必要なら有効化

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
