//api/postal-district/[postal_code_3]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type RouteParams = {
  params: Promise<{
    postal_code_3: string
  }>
}

export async function PUT(req: Request, { params }: RouteParams) {
  const body = await req.json().catch(() => ({}))
  const { postal_code_3 } = await params

  const payload = {
    district: body.district ?? null,
    dsp_short: body.dsp_short ?? null,
    transport_fee_per_service: Number(body.transport_fee_per_service ?? 0),
  }

  const { data, error } = await supabaseAdmin
    .from('postal_district')
    .update(payload)
    .eq('postal_code_3', postal_code_3)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { postal_code_3 } = await params

  const { error } = await supabaseAdmin
    .from('postal_district')
    .delete()
    .eq('postal_code_3', postal_code_3)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}