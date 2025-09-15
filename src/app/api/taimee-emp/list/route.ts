// app/api/taimee-emp/list/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!  // サーバ専用

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const status = (searchParams.get('status') ?? 'all') as 'all' | 'in' | 'not'
        const black = (searchParams.get('black') ?? 'all') as 'all' | 'only' | 'exclude'
        const memo = (searchParams.get('memo') ?? '').trim()

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false }
        })

        // 取得列（画面で使う主な列）
        let query = supabase
            .from('taimee_employees_with_entry')
            .select(`
        period_month,
        "ユーザーID（ユーザーによって一意な値）",
        姓, 名, 電話番号,
        taimee_user_id,
        normalized_phone,
        entry_id,
        in_entry,
        black_list,
        memo
      `)
            .order('period_month', { ascending: false })

        // Entry有無
        if (status === 'in') {
            query = query.eq('in_entry', true)
        } else if (status === 'not') {
            // in_entry が false または null を含めたい
            query = query.or('in_entry.is.false,in_entry.is.null')
        }

        // ブラック
        if (black === 'only') {
            query = query.eq('black_list', true)
        } else if (black === 'exclude') {
            // false または null を含めたい
            query = query.or('black_list.is.false,black_list.is.null')
        }

        // メモの部分一致（ILIKE）
        if (memo) {
            query = query.ilike('memo', `%${memo}%`)
        }

        const { data, error } = await query
        if (error) throw error

        return NextResponse.json({ ok: true, items: data })
    } catch (err: unknown) {
        return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 400 })
    }
}

function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    try { return JSON.stringify(err) } catch { return 'Unknown error' }
}

