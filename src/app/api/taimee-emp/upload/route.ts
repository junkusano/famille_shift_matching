// app/api/taimee-emp/upload/route.ts
import { NextResponse as Nx } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'

type ParsedCSV = { headers: string[]; rows: string[][] }

// --- 型ガード：'name' プロパティを持つか判定（型安全）
function hasName(x: unknown): x is { name: string } {
  return typeof x === 'object' && x !== null && 'name' in x && typeof (x as { name?: unknown }).name === 'string'
}

/** ダブルクォート対応・CRLF対応の簡易CSVパーサ */
function parseCSV(text: string): ParsedCSV {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  let headers: string[] = []

  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ } else { inQ = false }
        } else { cur += c }
      } else {
        if (c === ',') { out.push(cur); cur = '' }
        else if (c === '"') { inQ = true }
        else { cur += c }
      }
    }
    out.push(cur)
    return out
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (idx === 0) { headers = parseLine(line).map((h) => h.trim()); continue }
    if (!line) continue
    rows.push(parseLine(line))
  }
  return { headers, rows }
}

/** FormDataからFileを取り出す（型安全版） */
function getUploadFile(form: FormData): File | null {
  const f = form.get('file')
  if (!f) return null

  // まず File として判定（Undici の File 実装を想定）
  if (typeof File !== 'undefined' && f instanceof File) return f

  // Blob だが name を持つ場合は File に昇格（Node/環境差吸収）
  if (f instanceof Blob) {
    const name = hasName(f) ? f.name : 'upload.csv'
    return new File([f], name, { type: f.type })
  }
  return null
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = getUploadFile(form)
    if (!file) return Nx.json({ ok: false, error: 'file is required' }, { status: 400 })

    const supabase = createSb(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const buf = Buffer.from(await file.arrayBuffer())
    // ※ Shift_JIS の可能性がある場合は iconv-lite での変換に置換可
    const text = buf.toString('utf8')
    const { headers, rows } = parseCSV(text)

    const col = (name: string): number => headers.findIndex((h) => h.trim() === name)
    const idxUser  = col('ユーザーID（ユーザーによって一意な値）')
    const idxLast  = col('姓')
    const idxFirst = col('名')
    const idxPhone = col('電話番号')

    if (idxUser < 0) {
      return Nx.json({ ok: false, error: '必須ヘッダが見つかりません（ユーザーID列）' }, { status: 400 })
    }

    // 就業月：ファイル名から YYYYMM を推定（失敗時は当月1日）
    const uploadName = file.name ?? 'upload.csv'
    const m = uploadName.match(/(20\d{2})[-_\/]?(\d{2})/)
    const ym = m
      ? `${m[1]}-${m[2]}-01`
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .slice(0, 10)

    const inserts = rows.map((r): Record<string, string | null> => ({
      period_month: ym,
      source_filename: uploadName,
      uploaded_at: new Date().toISOString(),
      'ユーザーID（ユーザーによって一意な値）': r[idxUser] ?? '',
      姓: idxLast  >= 0 ? r[idxLast]  ?? null : null,
      名: idxFirst >= 0 ? r[idxFirst] ?? null : null,
      電話番号: idxPhone >= 0 ? r[idxPhone] ?? null : null,
      // taimee_user_id は GENERATED ALWAYS のため送らない
      // normalized_phone も GENERATED のため送らない
    }))

    const { error, count } = await supabase
      .from('taimee_employees_monthly')
      .upsert(inserts, {
        onConflict: 'period_month,taimee_user_id',
        ignoreDuplicates: false,
        count: 'exact',
      })

    if (error) throw error
    return Nx.json({ ok: true, count: count ?? inserts.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return Nx.json({ ok: false, error: msg }, { status: 500 })
  }
}
