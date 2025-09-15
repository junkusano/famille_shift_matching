// =============================
// app/api/taimee-emp/list/route.ts（新規 or 置換）
// フィルターに応じて view taimee_employees_with_entry を返す
// =============================
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const status = (searchParams.get('status') || 'all') as 'all' | 'in' | 'not'
    const black = (searchParams.get('black') || 'all') as 'all' | 'only' | 'exclude'
    const memo = (searchParams.get('memo') || '').trim()

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    let query = supabase
      .from('taimee_employees_with_entry')
      .select('*')
      .order('period_month', { ascending: false })

    if (status === 'in') query = query.eq('in_entry', true)
    if (status === 'not') query = query.eq('in_entry', false)

    if (black === 'only') query = query.eq('black_list', true)
    if (black === 'exclude') query = query.or('black_list.is.null,black_list.eq.false')

    if (memo) query = query.ilike('memo', `%${memo}%`)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, items: data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}