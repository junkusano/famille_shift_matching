// src/app/api/shift-service-code/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function PUT(req: Request) {
  const url = new URL(req.url)
  const id = url.pathname.split('/').pop()
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const body = await req.json()
  if (!body?.service_code) {
    return NextResponse.json({ error: 'service_code は必須です' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .update({
      service_code: body.service_code.trim(),
      require_doc_group: body.require_doc_group ?? null,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const id = url.pathname.split('/').pop()
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('shift_service_code')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
