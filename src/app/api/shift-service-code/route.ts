// src/app/api/shift_service_codes/route.ts
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
  const body = await req.json().catch(() => ({}))
  // 受け付けるカラムだけホワイトリスト
  const payload = {
    service_code: body.service_code ?? '',
    require_doc_group: body.require_doc_group ?? null,
    kaipoke_servicek: body.kaipoke_servicek ?? null,
    kaipoke_servicecode: body.kaipoke_servicecode ?? null,
  }
  if (!payload.service_code?.trim()) {
    return NextResponse.json({ error: 'service_code は必須です' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .insert(payload)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
