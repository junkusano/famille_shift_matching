// app/api/taimee-emp/list/route.ts（参照名のみ変更）
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'


export const runtime = 'nodejs'


type StatusFilter = 'all' | 'in' | 'not'


function toPeriodMonth(period: string): string {
const m = period?.match(/^\d{4}-\d{2}$/)
if (!m) throw new Error('period must be YYYY-MM')
return `${period}-01`
}


export async function GET(req: Request) {
try {
const { searchParams } = new URL(req.url)
const period = String(searchParams.get('period') || '').trim()
const status = (searchParams.get('status') || 'all').trim() as StatusFilter
const periodMonth = toPeriodMonth(period)


let q = supabaseAdmin
.from('taimee_employees_with_entry') // ← 新名称
.select('*')
.eq('period_month', periodMonth)
.order('姓', { ascending: true })
.order('名', { ascending: true })


if (status === 'in') q = q.eq('in_entry', true)
if (status === 'not') q = q.eq('in_entry', false)


const { data, error } = await q
if (error) throw error


return NextResponse.json({ ok: true, items: data ?? [] })
} catch (e: unknown) {
const message = e instanceof Error ? e.message : 'List failed'
return NextResponse.json({ ok: false, error: message }, { status: 400 })
}
}