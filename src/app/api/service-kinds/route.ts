import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET(_req: NextRequest) {
  const { data, error } = await supabaseAdmin
    .from('service_kinds')
    .select('id, label, sort_order')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
