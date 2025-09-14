// =============================
// app/api/taimee-emp/list/route.ts （月フィルター廃止版）
// =============================
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'


export const runtime = 'nodejs'


type StatusFilter = 'all' | 'in' | 'not'


export async function GET(req: Request) {
try {
const { searchParams } = new URL(req.url)
const status = (searchParams.get('status') || 'all').trim() as StatusFilter


let q = supabaseAdmin
.from('taimee_employees_with_entry')
.select('*')
.order('period_month', { ascending: false })
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