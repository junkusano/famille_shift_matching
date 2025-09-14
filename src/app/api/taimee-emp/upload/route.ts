// app/api/taimee-emp/upload/route.ts
import { NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'
import { supabaseAdmin } from '@/lib/supabase/service'


export const runtime = 'nodejs'
export const preferredRegion = 'auto'


type CsvRow = Record<string, string>


function toPeriodMonth(period: string): string {
    const m = period?.match(/^\d{4}-\d{2}$/)
    if (!m) throw new Error('period must be YYYY-MM')
    return `${period}-01`
}


export async function POST(req: Request) {
    try {
        const form = await req.formData()
        const period = String(form.get('period') || '').trim()
        const file = form.get('file') as File | null
        if (!period || !file) {
            return NextResponse.json({ ok: false, error: 'period and file are required' }, { status: 400 })
        }


        const periodMonth = toPeriodMonth(period)


        const ab = await file.arrayBuffer()
        const csv = Buffer.from(ab)


        const records = parse<CsvRow>(csv, {
            columns: true,
            skip_empty_lines: true,
            bom: true,
            trim: true,
        }) as CsvRow[]


        const rows = records.map((r: CsvRow) => ({
            period_month: periodMonth,
            source_filename: file.name,
            // CSV列（そのまま）
            "ユーザーID（ユーザーによって一意な値）": r["ユーザーID（ユーザーによって一意な値）"] ?? r["ユーザーID"] ?? r["ユーザーID(ユーザーによって一意な値)"],
            "姓": r["姓"],
            "名": r["名"],
            "住所": r["住所"],
            "生年月日": r["生年月日"],
            "性別": r["性別"],
            "電話番号": r["電話番号"],
            "初回稼働日": r["初回稼働日"],
            "最終稼働日": r["最終稼働日"],
            "累計通常勤務時間": r["累計通常勤務時間"],
            "累計深夜労働時間": r["累計深夜労働時間"],
            "累計法定外割増時間": r["累計法定外割増時間"],
            "累計実働時間": r["累計実働時間"],
            "累計稼働回数": r["累計稼働回数"],
            "累計源泉徴収額": r["累計源泉徴収額"],
            "累計給与支払額": r["累計給与支払額"],
            "累計交通費支払額": r["累計交通費支払額"],
        }))


        if (rows.length === 0) {
            return NextResponse.json({ ok: false, error: 'CSV has no rows' }, { status: 400 })
        }


        const { error } = await supabaseAdmin
            .from('taimee_employees_monthly')
            .upsert(rows, { onConflict: 'period_month,taimee_user_id' })
            .select('period_month')
            .limit(1)


        if (error) throw error


        return NextResponse.json({ ok: true, count: rows.length, period_month: periodMonth })
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Upload failed'
        console.error(e)
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}