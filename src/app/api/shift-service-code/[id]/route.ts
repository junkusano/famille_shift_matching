// src/app/api/shift-service-code/[id]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

type UpdatePayload = {
  service_code: string
  require_doc_group: string | null
}

// PUT: 更新（第2引数はインライン型で！）
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const supabase = getServiceClient()
  const id = params.id

  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const body = (await req.json()) as Partial<UpdatePayload>
  if (!body?.service_code || body.service_code.trim() === '') {
    return NextResponse.json({ error: 'service_code は必須です' }, { status: 400 })
  }

  const payload: UpdatePayload = {
    service_code: String(body.service_code).trim(),
    require_doc_group: body.require_doc_group ?? null,
  }

  const { data, error } = await supabase
    .from('shift_service_code')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: 削除（こちらもインライン型で統一）
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getServiceClient()
  const id = params.id
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const { error } = await supabase.from('shift_service_code').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
