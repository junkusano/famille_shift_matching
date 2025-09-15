// app/api/taimee-emp/update/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function PATCH(req: NextRequest) {
  try {
    const { normalized_phone, memo, black_list } = await req.json() as {
      normalized_phone?: string
      memo?: string | null
      black_list?: boolean
    }
    if (!normalized_phone) throw new Error('normalized_phone is required')

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })

    // 同一電話の全レコードを一括更新（最新月だけに限定したいなら WHERE period_month=max に変更）
    const { error } = await supabase
      .from('taimee_employees_monthly')
      .update({ memo, black_list })
      .eq('normalized_phone', normalized_phone)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'update failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
}