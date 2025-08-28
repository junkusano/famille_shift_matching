// app/api/shift-service-code/sync-from-shift/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

type ShiftRow = { service_code: string | null }
type ShiftServiceCodeRow = { service_code: string }

/**
 * POST:
 * 1) shift から DISTINCT service_code を取得
 * 2) shift_service_code に存在しないコードを抽出
 * 3) 未登録分をまとめて INSERT（require_doc_group は null）
 */
export async function POST() {
  const supabase = getServiceClient()

  // 1) shift 側の service_code（null除外）
  const { data: shiftCodes, error: errShift } = await supabase
    .from('shift')
    .select('service_code')
    .neq('service_code', null)

  if (errShift) return NextResponse.json({ error: errShift.message }, { status: 500 })

  const shiftRows = (shiftCodes ?? []) as ShiftRow[]
  const distinctShiftCodes = Array.from(
    new Set(
      shiftRows
        .map((r) => r.service_code?.trim())
        .filter((c): c is string => !!c && c.length > 0)
    )
  )

  // 2) 既存の shift_service_code
  const { data: existing, error: errExist } = await supabase
    .from('shift_service_code')
    .select('service_code')

  if (errExist) return NextResponse.json({ error: errExist.message }, { status: 500 })

  const existingRows = (existing ?? []) as ShiftServiceCodeRow[]
  const existingSet = new Set(existingRows.map((r) => r.service_code.trim()))

  const toInsert = distinctShiftCodes
    .filter((c) => !existingSet.has(c))
    .map((c) => ({ service_code: c, require_doc_group: null as string | null }))

  // 3) まとめて INSERT
  if (toInsert.length > 0) {
    const { error: errInsert } = await supabase.from('shift_service_code').insert(toInsert)
    if (errInsert) return NextResponse.json({ error: errInsert.message }, { status: 500 })
  }

  return NextResponse.json({ added: toInsert.length })
}
