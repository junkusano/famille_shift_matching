// app/api/sms/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'

type Row = { 姓?: string; 名?: string; 電話?: string }
type PreviewItem = { phone: string; body: string; ok: boolean; error?: string }

function normalizePhone(raw: string): string {
    const digits = (raw || '').replace(/\D/g, '')
    if (!digits) return ''
    let national = digits
    if (national.startsWith('81')) return `+${national}`
    if (national.startsWith('0')) national = national.slice(1)
    return `+81${national}`
}

function renderBody(tpl: string, fixed: string, row: Row): string {
    return tpl
        .replaceAll('{姓}', row.姓 ?? '')
        .replaceAll('{名}', row.名 ?? '')
        .replaceAll('{本文}', fixed ?? '')
}

export async function POST(req: NextRequest) {
    try {
        const { rows, template, fixedText } = await req.json()
        const items: PreviewItem[] = (rows as Row[]).map((r) => {
            const phone = normalizePhone(r.電話 || '')
            const body = renderBody(String(template || ''), String(fixedText || ''), r)
            const ok = !!phone && body.trim().length > 0
            const error = !phone ? '電話番号が不正' : (!ok ? '本文が空' : undefined)
            return { phone, body, ok, error }
        })
        const validCount = items.filter(i => i.ok).length
        return NextResponse.json({ ok: true, items, total: items.length, validCount, invalidCount: items.length - validCount })
    } catch (err: unknown) {
        return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 400 })
    }
}

function errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message
    if (typeof err === 'string') return err
    try { return JSON.stringify(err) } catch { return 'Unknown error' }
}

