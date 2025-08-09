import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

function extractIdFromUrl(req: Request): string {
  const pathname = new URL(req.url).pathname
  // 例: /api/fax/123 -> '123' を取得（末尾スラッシュにも対応）
  const segs = pathname.replace(/\/+$/, '').split('/')
  return segs[segs.length - 1] || ''
}

export async function PUT(req: Request) {
  const id = extractIdFromUrl(req)
  const body = await req.json()

  const update = {
    fax: body.fax as string,
    office_name: body.office_name as string,
    email: body.email as string,
    postal_code: (body.postal_code ?? null) as string | null,
    service_kind_id: (body.service_kind_id || null) as string | null, // 空文字→null
  }

  const { error } = await supabaseAdmin.from('fax').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const id = extractIdFromUrl(req)
  const { error } = await supabaseAdmin.from('fax').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
