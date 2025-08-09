// src/app/api/fax/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type RouteContext = { params: Record<string, string | string[]> }

export async function PUT(req: Request, { params }: RouteContext) {
  const raw = params['id']
  const id = Array.isArray(raw) ? raw[0] : raw

  const body = await req.json()
  const update = {
    fax: body.fax as string,
    office_name: body.office_name as string,
    email: body.email as string,
    postal_code: (body.postal_code ?? null) as string | null,
    service_kind_id: (body.service_kind_id || null) as string | null,
  }

  const { error } = await supabaseAdmin.from('fax').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const raw = params['id']
  const id = Array.isArray(raw) ? raw[0] : raw

  const { error } = await supabaseAdmin.from('fax').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
