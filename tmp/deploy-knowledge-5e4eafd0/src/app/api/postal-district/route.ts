//api/postal-district/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('postal_district')
    .select('*')
    .order('postal_code_3', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map((r) => ({
      ...r,
      transport_fee_per_service: Number(r.transport_fee_per_service ?? 0),
    }))
  )
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))

  const payload = {
    postal_code_3: String(body.postal_code_3 ?? '').trim(),
    district: body.district ?? null,
    dsp_short: body.dsp_short ?? null,
    transport_fee_per_service: Number(body.transport_fee_per_service ?? 0),
  }

  if (!/^\d{3}$/.test(payload.postal_code_3)) {
    return NextResponse.json({ error: 'postal_code_3 は3桁の数字で入力してください' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('postal_district')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}