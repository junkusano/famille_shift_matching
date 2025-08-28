// app/api/shift-service-code/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Row = {
  id: string
  service_code: string
  require_doc_group: string | null
  created_at?: string
  updated_at?: string
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// GET: 全件取得（service_code昇順）
export async function GET() {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('shift_service_code')
    .select('*')
    .order('service_code', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data as Row[])
}

// POST: 1件追加
export async function POST(req: Request) {
  const supabase = getServiceClient()
  const body = await req.json()

  if (!body?.service_code) {
    return NextResponse.json({ error: 'service_code は必須です' }, { status: 400 })
  }

  const payload = {
    service_code: String(body.service_code).trim(),
    require_doc_group: body.require_doc_group ?? null,
  }

  const { data, error } = await supabase
    .from('shift_service_code')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data as Row)
}
