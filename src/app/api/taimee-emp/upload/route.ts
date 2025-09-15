// app/api/taimee-emp/upload/route.ts
import { NextResponse as Nx } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'

type ParsedCSV = { headers: string[]; rows: string[][] }

// --- 型ガード：'name' プロパティを持つか判定（型安全）
function hasName(x: unknown): x is { name: string } {
    return typeof x === 'object' && x !== null && 'name' in x && typeof (x as { name?: unknown }).name === 'string'
}

/**
 * 改行入りセル対応・ダブルクォート対応の堅牢CSVパーサ（RFC4180準拠寄り）
 * - "..." 内の改行/カンマを1セルとして保持
 * - "" はエスケープされた "
 * - CRLF / CR / LF をすべて扱う
 * - 先頭BOM除去
 */
function parseCSVRobust(textInput: string): ParsedCSV {
    // 先頭BOM除去
    const text = textInput.replace(/^\uFEFF/, '')

    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    const pushCell = () => { row.push(cell); cell = '' }
    const pushRow = () => {
        // 完全な空行は捨てる
        if (row.length && row.some(v => v !== '')) rows.push(row)
        row = []
    }

    for (let i = 0; i < text.length; i++) {
        const c = text[i]

        if (inQuotes) {
            if (c === '"') {
                // 連続 "" はエスケープされた "
                if (text[i + 1] === '"') { cell += '"'; i++ }
                else { inQuotes = false }
            } else {
                // クォート内は改行も含めてそのまま
                cell += c
            }
        } else {
            if (c === '"') {
                inQuotes = true
            } else if (c === ',') {
                pushCell()
            } else if (c === '\r') {
                pushCell(); pushRow()
                if (text[i + 1] === '\n') i++ // CRLF
            } else if (c === '\n') {
                pushCell(); pushRow()         // LF
            } else {
                cell += c
            }
        }
    }
    // 末尾処理
    pushCell()
    pushRow()

    const headers = (rows.shift() ?? []).map(h => h.trim())
    return { headers, rows }
}

/** FormDataからFileを取り出す（型安全版） */
function getUploadFile(form: FormData): File | null {
    const f = form.get('file')
    if (!f) return null

    // まず File として判定（Undici の File 実装を想定）
    if (typeof File !== 'undefined' && f instanceof File) return f

    // Blob だが name を持つ場合は File に昇格（Node/環境差を吸収）
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
        // ※ Shift_JIS の可能性がある場合は iconv-lite での変換に差し替え可（今は UTF-8/BOM 前提）
        const text = buf.toString('utf8')
        const { headers, rows } = parseCSVRobust(text)

        // 必須ヘッダのindex取得
        const col = (name: string): number => headers.findIndex((h) => h === name)
        const idxUser = col('ユーザーID（ユーザーによって一意な値）')
        const idxLast = col('姓')
        const idxFirst = col('名')
        const idxPhone = col('電話番号')
        // 住所など他カラムも保存したい場合は index を追加して下でマッピングしてください
        // const idxAddr  = col('住所')

        if (idxUser < 0) {
            return Nx.json({ ok: false, error: '必須ヘッダが見つかりません（ユーザーID列）' }, { status: 400 })
        }

        // === 検証（オプション）：列数が合わない行があれば行番号を返す ===
        const expected = headers.length
        const badRows: number[] = []
        rows.forEach((r, i) => { if (r.length !== expected) badRows.push(i + 2) }) // +2 = 1行目ヘッダ、iは0起算
        if (badRows.length > 0) {
            return Nx.json({
                ok: false,
                error: `列数不一致の行があります: ${badRows.slice(0, 10).join(', ')}${badRows.length > 10 ? ' ...' : ''}（想定列数: ${expected}）`,
            }, { status: 400 })
        }

        // 就業月：ファイル名から YYYYMM を推定（失敗時は当月1日）
        const uploadName = file.name ?? 'upload.csv'
        const m = uploadName.match(/(20\d{2})[-_\/]?(\d{2})/)
        const ym = m
            ? `${m[1]}-${m[2]}-01`
            : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                .toISOString()
                .slice(0, 10)

        // セル正規化（前後空白は落とす。住所の改行は保持）
        const norm = (v: string | undefined): string | null =>
            typeof v === 'string' ? v.trim() : null

        const inserts = rows.map((r): Record<string, string | null> => ({
            period_month: ym,
            source_filename: uploadName,
            uploaded_at: new Date().toISOString(),
            'ユーザーID（ユーザーによって一意な値）': r[idxUser] ?? '',
            姓: idxLast >= 0 ? norm(r[idxLast]) : null,
            名: idxFirst >= 0 ? norm(r[idxFirst]) : null,
            電話番号: idxPhone >= 0 ? norm(r[idxPhone]) : null,
            // 住所: idxAddr >= 0 ? (r[idxAddr] ?? null) : null, // ← 保存したい場合はスキーマに合わせて列を追加
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
