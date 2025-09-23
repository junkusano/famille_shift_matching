// src/app/api/shift-service-code/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type UpdatePayload = {
  service_code?: string
  require_doc_group?: string | null
  kaipoke_servicek?: string | null
  kaipoke_servicecode?: string | null
}

type Params = { params: { id: string } }

// ── PUT /api/shift-service-code/[id]
export async function PUT(req: Request, { params }: Params) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const raw = (await req.json()) as unknown
  const payload: UpdatePayload = {}

  if (raw && typeof raw === 'object') {
    const b = raw as Record<string, unknown>
    if (typeof b.service_code === 'string') payload.service_code = b.service_code.trim()
    if ('require_doc_group' in b && (typeof b.require_doc_group === 'string' || b.require_doc_group === null)) {
      payload.require_doc_group = b.require_doc_group as string | null
    }
    if ('kaipoke_servicek' in b && (typeof b.kaipoke_servicek === 'string' || b.kaipoke_servicek === null)) {
      payload.kaipoke_servicek = b.kaipoke_servicek as string | null
    }
    if ('kaipoke_servicecode' in b && (typeof b.kaipoke_servicecode === 'string' || b.kaipoke_servicecode === null)) {
      payload.kaipoke_servicecode = b.kaipoke_servicecode as string | null
    }
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: '更新対象の項目がありません' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE /api/shift-service-code/[id]
export async function DELETE(_: Request, { params }: Params) {
  const { id } = params
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const { error } = await supabaseAdmin.from('shift_service_code').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
