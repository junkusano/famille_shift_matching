// app/api/user-doc-master/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? undefined

  let query = supabaseAdmin.from('user_doc_master').select('id,label,category,sort_order')
  if (category) query = query.eq('category', category)

  const { data, error } = await query.order('sort_order', { ascending: true }).order('label', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map((d) => ({
      value: d.label, // 必要なら d.id に変更
      label: d.label,
    }))
  )
}
