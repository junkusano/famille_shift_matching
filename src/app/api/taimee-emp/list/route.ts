// app/api/taimee-emp/list/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'


export const runtime = 'nodejs'


type StatusFilter = 'all' | 'in' | 'not'


function toPeriodMonth(period: string): string {
    const m = period?.match(/^\d{4}-\d{2}$/)
    if (!m) throw new Error('period must be YYYY-MM')
    return `${period}-01`
}


interface TaimeeEmployeeWithEntry {
    period_month: string
    source_filename: string
    uploaded_at: string
    // 元CSV列（主要項目）
    'ユーザーID（ユーザーによって一意な値）': string
    '姓': string | null
    '名': string | null
    '住所': string | null
    '生年月日': string | null
    '性別': string | null
    '電話番号': string | null
    '初回稼働日': string | null
    '最終稼働日': string | null
    '累計通常勤務時間': string | null
    '累計深夜労働時間': string | null
    '累計法定外割増時間': string | null
    '累計実働時間': string | null
    '累計稼働回数': string | null
    '累計源泉徴収額': string | null
    '累計給与支払額': string | null
    '累計交通費支払額': string | null
    // 生成/内部
    taimee_user_id: string
    normalized_phone: string
    // 突合結果
    entry_id: string | null
    in_entry: boolean | null
}


export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const periodParam = String(searchParams.get('period') || '').trim()
        const statusParam = (searchParams.get('status') || 'all').trim() as StatusFilter


        const periodMonth = toPeriodMonth(periodParam)


        let q = supabaseAdmin
            .from('v_taimee_employees_with_entry')
            .select('*')
            .eq('period_month', periodMonth)
            .order('姓', { ascending: true })
            .order('名', { ascending: true })


        if (statusParam === 'in') q = q.eq('in_entry', true)
        if (statusParam === 'not') q = q.eq('in_entry', false)


        const { data, error } = await q
        if (error) throw error


        // data の型を明示（ランタイムでは検証できないが、以降の利用コードの安全性が上がる）
        const items = (data ?? []) as TaimeeEmployeeWithEntry[]


        return NextResponse.json({ ok: true, items })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'List failed'
        return NextResponse.json({ ok: false, error: message }, { status: 400 })
    }
}