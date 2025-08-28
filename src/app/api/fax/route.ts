//api/fax

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'; // ✅ サーバー用クライアントに変更

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('fax')
    .select('id, fax, office_name, email, postal_code, service_kind_id')
    .order('office_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request) {
  const body = await req.json()
  const payload = {
    fax: (body.fax ?? '') as string,
    office_name: (body.office_name ?? '') as string,
    email: (body.email ?? '') as string,
    postal_code: (body.postal_code ?? null) as string | null,
    service_kind_id: (body.service_kind_id || null) as string | null,
  }
  const { error } = await supabaseAdmin.from('fax').insert(payload)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}