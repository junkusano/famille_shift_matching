// src/app/api/shift_service_codes/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic' // （キャッシュ最適化を避ける）
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('shift_service_code')
    .select(`
      *,
      jisseki_forms: jisseki_form ( form_name )
    `)
    .order('service_code', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    // フロント表示用にフラット化
    jisseki_form_name: r.jisseki_forms?.form_name ?? null,
  }))

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  // 受け付けるカラムだけホワイトリスト
  const payload = {
    service_code: body.service_code ?? '',
    require_doc_group: body.require_doc_group ?? null,
    kaipoke_servicek: body.kaipoke_servicek ?? null,
    kaipoke_servicecode: body.kaipoke_servicecode ?? null,
    contract_requrired: body.contract_requrired ?? null,
    plan_required: body.plan_required ?? null,
    idou_f: body.idou_f ?? false,
    jisseki_form: body.jisseki_form ?? null,
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
