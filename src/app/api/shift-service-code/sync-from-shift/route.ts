// app/api/shift-service-code/sync-from-shift/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function POST() {
  // shift の service_code を全部取得
  const { data: shiftCodes, error: errShift } = await supabaseAdmin
    .from('shift')
    .select('service_code')
    .neq('service_code', null)
  if (errShift) return NextResponse.json({ error: errShift.message }, { status: 500 })

  const distinctShiftCodes = Array.from(
    new Set((shiftCodes ?? []).map((r) => r.service_code?.trim()).filter(Boolean))
  )

  // 既存の service_code を取得
  const { data: existing, error: errExist } = await supabaseAdmin
    .from('shift_service_code')
    .select('service_code')
  if (errExist) return NextResponse.json({ error: errExist.message }, { status: 500 })

  const existingSet = new Set((existing ?? []).map((r) => r.service_code))
  const toInsert = distinctShiftCodes
    .filter((c) => !existingSet.has(c))
    .map((c) => ({ service_code: c, require_doc_group: null }))

  if (toInsert.length > 0) {
    const { error: errInsert } = await supabaseAdmin.from('shift_service_code').insert(toInsert)
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 })
  }

  return NextResponse.json({ added: toInsert.length })
}
