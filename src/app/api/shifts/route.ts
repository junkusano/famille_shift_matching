// /src/app/api/shifts/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'
import { createClient } from '@supabase/supabase-js'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// APIはNodeランタイムで実行（Service Role利用も可）
export const runtime = 'nodejs'

// === 共通: エラー型（軽量） ===
type SupaErrLike = { code?: string | null; message: string; details?: string | null; hint?: string | null }

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

const toHMS = (v: string) => {
  const s = String(v ?? '').trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':')
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
  }
  return s
}

const toBool = (v: unknown): 0 | 1 => (String(v ?? '').trim().toUpperCase() === 'TRUE' ? 1 : 0)

const getBearerToken = (req: Request): string | null => {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1] ?? null
}

// ★ daily と同じ発想：referer から pathname（無ければ monthly）
const resolveRequestPath = (req: Request): string => {
  const referer = req.headers.get('referer') ?? ''
  try {
    return referer ? new URL(referer).pathname : '/portal/roster/monthly'
  } catch {
    return '/portal/roster/monthly'
  }
}

/**
 * ★重要：daily と同じ「ユーザーJWT優先」で Supabase client を作る
 * - Bearer があれば anon + Authorization: Bearer(userJWT) で PostgREST 実行
 *   → DB側で auth.uid() が取れる = actor_user_id が埋まる
 * - Bearer が無ければ cookie route client を試す
 * - それも無理なら service role fallback（この場合 actor_user_id は空のまま）
 *
 * さらに request_path を DB へ渡すために、Supabase へのリクエストヘッダに
 * referer 相当 & x-request-path を付ける（daily と同じ思想）
 */
const getWriteClient = (req: Request) => {
  const token = getBearerToken(req)
  const requestPath = resolveRequestPath(req)

  console.info('[shifts] hasCookie', req.headers.get('cookie') ? 'yes' : 'no')
  console.info('[shifts] hasAuthHeader', token ? 'yes' : 'no')

  const host = req.headers.get('host') ?? 'localhost'
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const origin = req.headers.get('origin') ?? `${proto}://${host}`
  const refererForDb = `${origin}${requestPath}`

  // 1) Bearer(userJWT) 優先（daily方式）
  if (token) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anon) {
      console.warn('[shifts] missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
    } else {
      return createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
            // DB側が request.headers / referer を見ている場合に備えて両方渡す
            'x-request-path': requestPath,
            referer: refererForDb,
          },
        },
      })
    }
  }

  // 2) cookie セッション（auth-helpers）
  // ※ monthly側が localStorage auth だとここは AuthSessionMissingError になることが多い
  return createRouteHandlerClient({ cookies })
}

const getActorUserIdText = async (req: Request): Promise<string | null> => {
  try {
    const supabase = getWriteClient(req)
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.warn('[shifts] getUser error', error)
      return null
    }
    return data.user?.id ?? null
  } catch (e) {
    console.warn('[shifts] getActorUserIdText failed', e)
    return null
  }
}

/**
 * GET /api/shifts?kaipoke_cs_id=XXXX&month=YYYY-MM
 * - view からは * を取得し、足りない項目は API 層で補完（デフォルト値）
 * - 月フィルタは [月初, 翌月初) の範囲フィルタ
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const kaipokeCsId = searchParams.get('kaipoke_cs_id') ?? ''
    const month = searchParams.get('month') ?? ''

    console.info('[shifts][GET] kaipoke_cs_id=', kaipokeCsId, ' month=', month)

    if (!kaipokeCsId || !month) return json({ error: 'kaipoke_cs_id and month are required' }, 400)

    const m = month.match(/^(\d{4})-(\d{2})$/)
    if (!m) return json({ error: 'month must be YYYY-MM' }, 400)

    const year = Number(m[1])
    const mon = Number(m[2])
    const startDate = new Date(Date.UTC(year, mon - 1, 1))
    const endDate = new Date(Date.UTC(year, mon, 1))
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    const gte = fmt(startDate)
    const lt = fmt(endDate)

    const { data, error } = await supabaseAdmin
      .from('shift_csinfo_postalname_view')
      .select('*')
      .eq('kaipoke_cs_id', kaipokeCsId)
      .gte('shift_start_date', gte)
      .lt('shift_start_date', lt)
      .order('shift_start_date', { ascending: true })

    if (error) {
      console.error('[shifts][GET] error', error)
      return json({ error: error.message }, 500)
    }

    const normalized = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => {
      const staff02Attend = toBool(row['staff_02_attend_flg'])
      const staff03Attend = toBool(row['staff_03_attend_flg'])

      const requiredCount =
        typeof row['required_staff_count'] === 'number' ? (row['required_staff_count'] as number) : 1
      const twoPerson = toBool(row['two_person_work_flg'])

      return {
        shift_id: String(row['shift_id'] ?? ''),
        kaipoke_cs_id: String(row['kaipoke_cs_id'] ?? ''),
        name: String(row['name'] ?? ''),
        shift_start_date: String(row['shift_start_date'] ?? ''),
        shift_start_time: String(row['shift_start_time'] ?? ''),
        shift_end_time: String(row['shift_end_time'] ?? ''),
        service_code: String(row['service_code'] ?? ''),
        staff_01_user_id: row['staff_01_user_id'] ? String(row['staff_01_user_id']) : null,
        staff_02_user_id: row['staff_02_user_id'] ? String(row['staff_02_user_id']) : null,
        staff_03_user_id: row['staff_03_user_id'] ? String(row['staff_03_user_id']) : null,
        staff_02_attend_flg: staff02Attend,
        staff_03_attend_flg: staff03Attend,
        required_staff_count: String(requiredCount),
        two_person_work_flg: String(twoPerson),
        tokutei_comment: row['tokutei_comment'] != null ? String(row['tokutei_comment']) : null,
        judo_ido: String(row['judo_ido'] ?? ''),
      }
    })

    console.info('[shifts][GET] result count=', normalized.length)
    return json(normalized, 200)
  } catch (e: unknown) {
    console.error('[shifts][GET] unhandled error', e)
    return json({ error: 'internal error' }, 500)
  }
}

// === POST /api/shifts : 新規作成 ===
export async function POST(req: Request) {
  try {
    const actorUserIdText = await getActorUserIdText(req)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][POST] actorUserIdText', actorUserIdText, 'path', requestPath)

    const supabase = getWriteClient(req)
    const raw = (await req.json()) as Record<string, unknown>

    for (const k of ['kaipoke_cs_id', 'shift_start_date', 'shift_start_time'] as const) {
      if (!raw[k]) return json({ error: { message: `missing field: ${k}` } }, 400)
    }

    const dispatchSize = raw['dispatch_size'] as string | undefined
    const dupRole = raw['dup_role'] as string | undefined

    const required_staff_count =
      (raw['required_staff_count'] as number | undefined) ?? (dispatchSize === '01' ? 2 : 1)

    let two_person_work_flg = required_staff_count >= 2
    if (!two_person_work_flg) {
      two_person_work_flg =
        (raw['two_person_work_flg'] as boolean | undefined) ?? (!!dupRole && dupRole !== '-')
    }

    const row = {
      kaipoke_cs_id: String(raw['kaipoke_cs_id']),
      shift_start_date: String(raw['shift_start_date']),
      shift_start_time: toHMS(String(raw['shift_start_time'])),
      shift_end_date: (raw['shift_end_date'] ?? null) as string | null,
      shift_end_time: raw['shift_end_time'] ? toHMS(String(raw['shift_end_time'])) : null,
      service_code: (raw['service_code'] ?? null) as string | null,
      staff_01_user_id: (raw['staff_01_user_id'] ?? null) as string | null,
      staff_02_user_id: (raw['staff_02_user_id'] ?? null) as string | null,
      staff_02_attend_flg: Boolean(raw['staff_02_attend_flg'] ?? false),
      staff_03_user_id: (raw['staff_03_user_id'] ?? null) as string | null,
      staff_03_attend_flg: Boolean(raw['staff_03_attend_flg'] ?? false),
      required_staff_count,
      two_person_work_flg,
      staff_01_role_code: (raw['staff_01_role_code'] ?? null) as string | null,
      staff_02_role_code: (raw['staff_02_role_code'] ?? null) as string | null,
      staff_03_role_code: (raw['staff_03_role_code'] ?? null) as string | null,
      judo_ido: (raw['judo_ido'] ?? null) as string | null,
      tokutei_comment: (raw['tokutei_comment'] ?? null) as string | null,
    }

    const { data, error } = await supabase.from('shift').insert(row).select('shift_id').single()
    if (error) {
      const e = error as SupaErrLike
      return json({ error: { code: e.code ?? null, message: e.message } }, 400)
    }
    return json({ shift_id: (data as { shift_id: number }).shift_id }, 201)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][POST] unhandled error', err)
    return json({ error: err }, 500)
  }
}

// === PUT /api/shifts : 更新 ===
export async function PUT(req: Request) {
  try {
    const actorUserIdText = await getActorUserIdText(req)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][PUT] actorUserIdText', actorUserIdText, 'path', requestPath)

    const supabase = getWriteClient(req)
    const raw = (await req.json()) as Record<string, unknown>

    const idVal = raw['shift_id'] ?? raw['id']
    const id =
      typeof idVal === 'string' ? Number(idVal) : typeof idVal === 'number' ? idVal : null

    const patch: Record<string, unknown> = {}
    const setIf = (k: string, v: unknown) => {
      if (v !== undefined) patch[k] = v
    }

    setIf('shift_start_date', raw['shift_start_date'] as string | undefined)
    setIf('shift_end_date', raw['shift_end_date'] as string | undefined)
    if (raw['shift_start_time'] !== undefined) patch['shift_start_time'] = toHMS(String(raw['shift_start_time']))
    if (raw['shift_end_time'] !== undefined) patch['shift_end_time'] = toHMS(String(raw['shift_end_time']))

    ;(
      [
        'service_code',
        'staff_01_user_id',
        'staff_02_user_id',
        'staff_03_user_id',
        'staff_01_role_code',
        'staff_02_role_code',
        'staff_03_role_code',
        'judo_ido',
        'tokutei_comment',
      ] as const
    ).forEach((k) => setIf(k, (raw[k] ?? null) as string | null))

    if (raw['staff_02_attend_flg'] !== undefined) patch['staff_02_attend_flg'] = Boolean(raw['staff_02_attend_flg'])
    if (raw['staff_03_attend_flg'] !== undefined) patch['staff_03_attend_flg'] = Boolean(raw['staff_03_attend_flg'])

    if (raw['required_staff_count'] !== undefined) {
      const requiredCount = Number(raw['required_staff_count'])
      patch['required_staff_count'] = requiredCount
      if (requiredCount >= 2) {
        patch['two_person_work_flg'] = true
      } else if (raw['two_person_work_flg'] !== undefined) {
        patch['two_person_work_flg'] = Boolean(raw['two_person_work_flg'])
      }
    } else if (raw['two_person_work_flg'] !== undefined) {
      patch['two_person_work_flg'] = Boolean(raw['two_person_work_flg'])
    }

    if (Object.keys(patch).length === 0) return json({ error: { message: 'no fields to update' } }, 400)

    if (id != null) {
      const { data, error } = await supabase.from('shift').update(patch).eq('shift_id', id).select('shift_id').single()
      if (error) {
        const e = error as SupaErrLike
        return json({ error: { code: e.code ?? null, message: e.message } }, 400)
      }
      return json({ ok: true, shift_id: (data as { shift_id: number }).shift_id })
    }

    const cs = raw['kaipoke_cs_id'] as string | undefined
    const sd = raw['shift_start_date'] as string | undefined
    const st = raw['shift_start_time'] as string | undefined

    if (cs && sd && st) {
      const { data, error } = await supabase
        .from('shift')
        .update(patch)
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)))
        .select('shift_id')
        .single()

      if (error) {
        const e = error as SupaErrLike
        return json({ error: { code: e.code ?? null, message: e.message } }, 400)
      }
      return json({ ok: true, shift_id: (data as { shift_id: number }).shift_id })
    }

    return json({ error: { message: 'missing shift_id (or composite keys)' } }, 400)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][PUT] unhandled error', err)
    return json({ error: err }, 500)
  }
}

// === DELETE /api/shifts : 削除 ===
export async function DELETE(req: Request) {
  try {
    const actorUserIdText = await getActorUserIdText(req)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][DELETE] actorUserIdText', actorUserIdText, 'path', requestPath)

    const supabase = getWriteClient(req)
    const raw = (await req.json()) as Record<string, unknown>

    if (Array.isArray(raw['ids'])) {
      const ids = (raw['ids'] as unknown[])
        .map((v) => (typeof v === 'string' ? Number(v) : v))
        .filter((v): v is number => typeof v === 'number')

      if (ids.length === 0) return json({ error: { message: 'ids is empty' } }, 400)

      const { error } = await supabase.from('shift').delete().in('shift_id', ids)
      if (error) {
        const e = error as SupaErrLike
        return json({ error: { code: e.code ?? null, message: e.message } }, 400)
      }
      return json({ ok: true, count: ids.length })
    }

    const idVal = raw['shift_id'] ?? raw['id']
    if (idVal != null) {
      const id = typeof idVal === 'string' ? Number(idVal) : (idVal as number)
      const { error } = await supabase.from('shift').delete().eq('shift_id', id)
      if (error) {
        const e = error as SupaErrLike
        return json({ error: { code: e.code ?? null, message: e.message } }, 400)
      }
      return json({ ok: true, count: 1 })
    }

    const cs = raw['kaipoke_cs_id'] as string | undefined
    const sd = raw['shift_start_date'] as string | undefined
    const st = raw['shift_start_time'] as string | undefined
    if (cs && sd && st) {
      const { error } = await supabase
        .from('shift')
        .delete()
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)))

      if (error) {
        const e = error as SupaErrLike
        return json({ error: { code: e.code ?? null, message: e.message } }, 400)
      }
      return json({ ok: true, count: 1 })
    }

    return json({ error: { message: 'missing ids or composite keys' } }, 400)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][DELETE] unhandled error', err)
    return json({ error: err }, 500)
  }
}