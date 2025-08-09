// app/api/postal-districts/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // 読み取り専用なら anon key でもOK（RLSポリシー次第）
  const { data, error } = await supabase
    .from('postal_district')
    .select('postal_code_3,district')
    .order('district', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
