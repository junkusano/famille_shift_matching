// app/api/taimee-emp/upload/route.ts
import { NextResponse as Nx } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/service'

type ParsedCSV = { headers: string[]; rows: string[][] }
type ImportRow = Record<string, string | null>

const USER_ID_COLUMN = 'ユーザーID（ユーザーによって一意な値）'

function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'object' && error !== null) {
        const value = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
        const parts = [value.message, value.details, value.hint, value.code && `code=${String(value.code)}`]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
        if (parts.length > 0) return parts.join(' / ')
    }
    return 'CSVの登録に失敗しました'
}

async function requireManager(req: Request): Promise<void> {
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    if (!token) throw new Error('UNAUTHORIZED')

    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data.user) throw new Error('UNAUTHORIZED')

    const { data: staff, error: staffError } = await supabaseAdmin
        .from('users')
        .select('system_role')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()

    if (staffError) throw staffError
    if (!['admin', 'manager'].includes((staff?.system_role ?? '').toLowerCase())) {
        throw new Error('FORBIDDEN')
    }
}

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
        await requireManager(req)
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
        const idxUser = col(USER_ID_COLUMN)

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

        const mappedColumns = [
            USER_ID_COLUMN,
            '姓', '名', '住所', '生年月日', '性別', '電話番号', '初回稼働日', '最終稼働日',
            '累計通常勤務時間', '累計深夜労働時間', '累計法定外割増時間', '累計実働時間',
            '累計稼働回数', '累計源泉徴収額', '累計給与支払額', '累計交通費支払額',
        ] as const
        const indexes = Object.fromEntries(mappedColumns.map((name) => [name, col(name)])) as Record<string, number>
        const missingUserIds: number[] = []
        const duplicateUserIds: string[] = []
        const seenUserIds = new Set<string>()
        const uploadedAt = new Date().toISOString()
        const inserts = rows.map((r, index): ImportRow => {
            const userId = norm(r[idxUser])
            if (!userId) missingUserIds.push(index + 2)
            else if (seenUserIds.has(userId)) duplicateUserIds.push(userId)
            else seenUserIds.add(userId)

            const mapped = Object.fromEntries(mappedColumns.map((name) => [name, indexes[name] >= 0 ? norm(r[indexes[name]]) : null]))
            return {
                period_month: ym,
                source_filename: uploadName,
                uploaded_at: uploadedAt,
                ...mapped,
                [USER_ID_COLUMN]: userId ?? '',
                // taimee_user_id / normalized_phone は generated column のため送らない
            }
        })

        if (missingUserIds.length > 0) {
            return Nx.json({ ok: false, error: `ユーザーIDが空の行があります: ${missingUserIds.slice(0, 10).join(', ')}` }, { status: 400 })
        }
        if (duplicateUserIds.length > 0) {
            return Nx.json({ ok: false, error: `CSV内に重複したユーザーIDがあります: ${duplicateUserIds.slice(0, 3).join(', ')}` }, { status: 400 })
        }

        // taimee_user_id はCSVのユーザーIDから生成される列。全角括弧付きの元列名を
        // PostgRESTのフィルターに渡すと解釈できないため、生成済みのASCII列を使う。
        const taimeeUserIds = inserts.map((row) => row[USER_ID_COLUMN]!).filter((value): value is string => typeof value === 'string')
        const existingTaimeeUserIds = new Set<string>()
        // PostgREST のURL長制限を避けるため、既存判定は小分けに取得する。
        for (let offset = 0; offset < taimeeUserIds.length; offset += 100) {
            const { data: existing, error: existingError } = await supabase
                .from('taimee_employees_monthly')
                .select('*')
                .eq('period_month', ym)
                .in('taimee_user_id', taimeeUserIds.slice(offset, offset + 100))

            if (existingError) throw existingError
            for (const row of existing ?? []) {
                if (typeof row.taimee_user_id === 'string') {
                    existingTaimeeUserIds.add(row.taimee_user_id)
                }
            }
        }

        const existingRows = inserts.filter((row) => existingTaimeeUserIds.has(row[USER_ID_COLUMN] ?? ''))
        const newRows = inserts.filter((row) => !existingTaimeeUserIds.has(row[USER_ID_COLUMN] ?? ''))

        // 主キーは全角括弧を含むCSV列名であり、PostgRESTのonConflictには指定できない。
        // taimee_user_id（本番で一意性を確認済み）を使い、既存者はUPDATE、新規者のみINSERTする。
        let updated = 0
        for (const row of existingRows) {
            const taimeeUserId = row[USER_ID_COLUMN]
            const { [USER_ID_COLUMN]: _userId, ...patch } = row
            const { data, error } = await supabase
                .from('taimee_employees_monthly')
                .update(patch)
                .eq('taimee_user_id', taimeeUserId)
                .select('*')

            if (error) throw error
            if ((data ?? []).length !== 1) {
                throw new Error(`更新確認件数が一致しません（ユーザーID: ${taimeeUserId ?? '不明'}）`)
            }
            updated += 1
        }

        let inserted = 0
        if (newRows.length > 0) {
            const { data, error } = await supabase
                .from('taimee_employees_monthly')
                .insert(newRows)
                .select('*')

            if (error) throw error
            inserted = (data ?? []).length
            if (inserted !== newRows.length) {
                throw new Error(`DBへの登録確認件数が一致しません（CSV ${newRows.length}件、DB ${inserted}件）`)
            }
        }
        return Nx.json({ ok: true, parsed: rows.length, inserted, updated, skipped: 0, failed: 0 })
    } catch (e: unknown) {
        const rawMessage = errorMessage(e)
        const status = rawMessage === 'UNAUTHORIZED' ? 401 : rawMessage === 'FORBIDDEN' ? 403 : 500
        const message = rawMessage === 'UNAUTHORIZED'
            ? 'ログインしてください'
            : rawMessage === 'FORBIDDEN'
                ? 'この操作を実行する権限がありません'
                : rawMessage
        console.error('[taimee-emp/upload] failed', {
            message: e && typeof e === 'object' && 'message' in e ? (e as { message?: unknown }).message : undefined,
            code: e && typeof e === 'object' && 'code' in e ? (e as { code?: unknown }).code : undefined,
            details: e && typeof e === 'object' && 'details' in e ? (e as { details?: unknown }).details : undefined,
            hint: e && typeof e === 'object' && 'hint' in e ? (e as { hint?: unknown }).hint : undefined,
        })
        return Nx.json({ ok: false, error: message }, { status })
    }
}
