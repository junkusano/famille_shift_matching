// src/app/api/shift-service-code/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type Params = { params: { id: string } }

export async function PUT(req: Request, { params }: Params) {
  const { id } = params
  const body = await req.json().catch(() => ({}))

  // 更新許可するカラムのみ反映（created_at/updated_at/id は送られてきても無視）
  const payload: Record<string, any> = {}
  if ('service_code' in body) payload.service_code = body.service_code
  if ('require_doc_group' in body) payload.require_doc_group = body.require_doc_group
  if ('kaipoke_servicek' in body) payload.kaipoke_servicek = body.kaipoke_servicek
  if ('kaipoke_servicecode' in body) payload.kaipoke_servicecode = body.kaipoke_servicecode

  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: Params) {
  const { id } = params
  const { error } = await supabaseAdmin.from('shift_service_code').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
