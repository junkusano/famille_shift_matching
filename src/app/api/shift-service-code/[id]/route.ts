// src/app/api/shift-service-code/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

// URL から [id] を安全に取得
function extractId(urlStr: string): string | null {
  const parts = new URL(urlStr).pathname.split('/').filter(Boolean)
  // .../api/shift-service-code/{id}
  return parts.length > 0 ? decodeURIComponent(parts[parts.length - 1]) : null
}

// ── PUT /api/shift-service-code/[id]
export async function PUT(req: Request) {
  const id = extractId(req.url)
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const body = await req.json().catch(() => null) as unknown
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  // 受け付けるカラムのみ反映
  const b = body as Record<string, unknown>
  const payload: {
    service_code?: string
    require_doc_group?: string | null
    kaipoke_servicek?: string | null
    kaipoke_servicecode?: string | null
  } = {}

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
export async function DELETE(req: Request) {
  const id = extractId(req.url)
  if (!id) return NextResponse.json({ error: 'id が必要です' }, { status: 400 })

  const { error } = await supabaseAdmin.from('shift_service_code').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
