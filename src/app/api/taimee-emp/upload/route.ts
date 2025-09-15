// app/api/taimee-emp/upload/route.ts
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// CSVの想定列（存在しない列は空文字扱い）
type CSVRow = {
  'ユーザーID（ユーザーによって一意な値）'?: unknown
  'ユーザーID'?: unknown
  '姓'?: unknown
  '名'?: unknown
  '住所'?: unknown
  '生年月日'?: unknown
  '性別'?: unknown
  '電話'?: unknown
  '電話番号'?: unknown
  '初回稼働日'?: unknown
  '最終稼働日'?: unknown
  '累計通常勤務時間'?: unknown
  '累計深夜労働時間'?: unknown
  '累計法定外割増時間'?: unknown
  '累計実働時間'?: unknown
  '累計稼働回数'?: unknown
  '累計源泉徴収額'?: unknown
  '累計給与支払額'?: unknown
  '累計交通費支払額'?: unknown
  black_list?: unknown
  memo?: unknown
}

// DB投入レコード（主な列のみ列挙）
type InsertRow = {
  period_month: string
  source_filename: string
  'ユーザーID（ユーザーによって一意な値）': string
  姓: string
  名: string
  住所: string
  生年月日: string
  性別: string
  電話番号: string
  初回稼働日: string
  最終稼働日: string
  累計通常勤務時間: string
  累計深夜労働時間: string
  累計法定外割増時間: string
  累計実働時間: string
  累計稼働回数: string
  累計源泉徴収額: string
  累計給与支払額: string
  累計交通費支払額: string
  taimee_user_id: string
  normalized_phone: string
  black_list: boolean
  memo: string | null
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try { return JSON.stringify(err) } catch { return 'Unknown error' }
}

function toStr(v: unknown): string {
  return v == null ? '' : String(v)
}
function toBool(v: unknown): boolean {
  const s = toStr(v).trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}
function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}
function toE164JP(raw: string): string {
  const d = onlyDigits(raw)
  if (!d) return ''
  if (d.startsWith('81')) return `+${d}`
  return `+81${d.replace(/^0/, '')}`
}

// YYYY[-/_]?MM を拾って 1日始まり
function inferPeriodFromFilename(name: string): string | null {
  const m = name.match(/(20\d{2})[-_\/]?(\d{1,2})/)
  if (!m) return null
  const y = Number(m[1])
  const mm = String(Number(m[2])).padStart(2, '0')
  return `${y}-${mm}-01`
}
function currentMonthJST(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase環境変数(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)が未設定です')
    }

    const form = await req.formData()
    const file = form.get('file')
    let period = toStr(form.get('period')).trim()

    if (!(file instanceof File)) throw new Error('file is required')

    if (!period) {
      period = inferPeriodFromFilename(file.name) ?? currentMonthJST()
    }

    const csv = await file.text()

    const parsed = Papa.parse<CSVRow>(csv, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    if (parsed.errors.length > 0) {
      // 最初のエラーのみ返却
      const first = parsed.errors[0]
      throw new Error(`CSV parse error: ${first.message} at row ${first.row ?? 'n/a'}`)
    }

    const rows: InsertRow[] = (parsed.data as CSVRow[]).map((r): InsertRow => {
      const uid = toStr(r['ユーザーID（ユーザーによって一意な値）'] ?? r['ユーザーID'])
      const last = toStr(r['姓'])
      const first = toStr(r['名'])
      const phoneRaw = toStr(r['電話'] ?? r['電話番号'])
      const phoneE164 = toE164JP(phoneRaw)

      return {
        period_month: period,
        source_filename: file.name,
        'ユーザーID（ユーザーによって一意な値）': uid,
        姓: last,
        名: first,
        住所: toStr(r['住所']),
        生年月日: toStr(r['生年月日']),
        性別: toStr(r['性別']),
        電話番号: phoneRaw,
        初回稼働日: toStr(r['初回稼働日']),
        最終稼働日: toStr(r['最終稼働日']),
        累計通常勤務時間: toStr(r['累計通常勤務時間']),
        累計深夜労働時間: toStr(r['累計深夜労働時間']),
        累計法定外割増時間: toStr(r['累計法定外割増時間']),
        累計実働時間: toStr(r['累計実働時間']),
        累計稼働回数: toStr(r['累計稼働回数']),
        累計源泉徴収額: toStr(r['累計源泉徴収額']),
        累計給与支払額: toStr(r['累計給与支払額']),
        累計交通費支払額: toStr(r['累計交通費支払額']),
        taimee_user_id: uid,
        normalized_phone: phoneE164,
        black_list: toBool(r.black_list),
        memo: (() => {
          const m = toStr(r.memo).trim()
          return m ? (m.length > 2000 ? m.slice(0, 2000) : m) : null
        })(),
      }
    })

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
    const { error } = await supabase.from('taimee_employees_monthly').insert(rows)

    if (error) throw error

    return NextResponse.json({ ok: true, count: rows.length, period })
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: errorMessage(err) }, { status: 400 })
  }
}
