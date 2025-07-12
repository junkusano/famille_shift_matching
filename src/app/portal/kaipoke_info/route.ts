// /portal/kaipoke_info/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: 一覧表示用
export async function GET(req: NextRequest) {
  const { data, error } = await supabase
    .from('cs_kaipoke_info')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST: 新規追加または編集（例：IDでupsert）
export async function POST(req: NextRequest) {
  const body = await req.json()

  const { data, error } = await supabase
    .from('cs_kaipoke_info')
    .upsert(body)
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
