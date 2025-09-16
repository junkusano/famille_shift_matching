// app/api/shift-service-code/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .select('*')
    .order('service_code', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body?.service_code) {
    return NextResponse.json({ error: 'service_code は必須です' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .insert({
      service_code: body.service_code.trim(),
      require_doc_group: body.require_doc_group ?? null,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
