// src/app/api/shift-service-code/[id]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

function extractId(req: NextRequest): string | null {
  const { pathname } = new URL(req.url)
  const parts = pathname.split('/').filter(Boolean)
  return parts.at(-1) ?? null
}

type Body = {
  service_code?: string
  require_doc_group?: string | null
  kaipoke_servicek?: string | null
  kaipoke_servicecode?: string | null
  contract_requrired?: string | null
  plan_required?: string | null
  idou_f?: boolean | null
}

// ── PUT /api/shift-service-code/[id]
export async function PUT(req: NextRequest) {
  const id = extractId(req)
  if (!id) {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
  }

  let b: Body
  try {
    b = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'JSON が不正です' }, { status: 400 })
  }

  const payload: Body = {}

  if (typeof b.service_code === 'string') {
    payload.service_code = b.service_code.trim()
  }
  if ('require_doc_group' in b) {
    payload.require_doc_group = b.require_doc_group ?? null
  }
  if ('kaipoke_servicek' in b) {
    payload.kaipoke_servicek = b.kaipoke_servicek ?? null
  }
  if ('kaipoke_servicecode' in b) {
    payload.kaipoke_servicecode = b.kaipoke_servicecode ?? null
  }

  // ★ ここを追加（真偽値そのまま渡す）
  if ('idou_f' in b) {
    payload.idou_f = b.idou_f ?? null
  }

  // ★ uuid カラムは "" を null にしてから渡す
  if ('contract_requrired' in b) {
    const v = b.contract_requrired
    payload.contract_requrired = v && v !== '' ? v : null
  }
  if ('plan_required' in b) {
    const v = b.plan_required
    payload.plan_required = v && v !== '' ? v : null
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json(
      { error: '更新対象の項目がありません' },
      { status: 400 },
    )
  }

  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[shift-service-code PUT] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// ── DELETE /api/shift-service-code/[id]
export async function DELETE(req: NextRequest) {
  const id = extractId(req)
  if (!id) {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('shift_service_code')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[shift-service-code DELETE] error', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}