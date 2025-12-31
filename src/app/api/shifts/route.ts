// /src/app/api/shifts/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { notifyShiftChange } from "@/lib/lineworks/shiftChangeNotify";

// APIはNodeランタイムで実行（Service Role利用）
export const runtime = 'nodejs'

// === 共通: エラー型（軽量） ===
//type SupaErrLike = { code?: string | null; message: string; details?: string | null; hint?: string | null }

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

const toHMS = (v: string) => {
  const s = String(v ?? '').trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':')
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
  }
  return s // 想定外はDB側でエラー
}

const toBool = (v: unknown): 0 | 1 => (String(v ?? '').trim().toUpperCase() === 'TRUE' ? 1 : 0)

const getBearerToken = (req: Request): string | null => {
  const h = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1] ?? null
}

// ★ daily と同じ：Bearer 優先 → cookie fallback
const resolveActorUserIdText = async (req: Request): Promise<string | null> => {
  try {
    const token = getBearerToken(req)

    console.info('[shifts] hasCookie', req.headers.get('cookie') ? 'yes' : 'no')
    console.info('[shifts] hasAuthHeader', token ? 'yes' : 'no')

    // 1) Authorization: Bearer <jwt>
    if (token) {
      const { data, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && data.user?.id) return data.user.id
      console.warn('[shifts] supabaseAdmin.auth.getUser(Bearer) error', error)
    }

    // 2) cookie セッション fallback
    const supabaseAuth = createRouteHandlerClient({ cookies })
    const { data: cookieUser, error: cookieErr } = await supabaseAuth.auth.getUser()
    if (!cookieErr && cookieUser.user?.id) return cookieUser.user.id

    if (cookieErr) console.warn('[shifts] cookie getUser error', cookieErr)
    return null
  } catch (e) {
    console.warn('[shifts] resolveActorUserIdText failed', e)
    return null
  }
}

// ★ daily と同じ：referer → pathname（なければ monthly をデフォルト）
const resolveRequestPath = (req: Request): string => {
  const referer = req.headers.get('referer') ?? ''
  try {
    return referer ? new URL(referer).pathname : '/portal/roster/monthly'
  } catch {
    return '/portal/roster/monthly'
  }
}

/**
 * GET /api/shifts?kaipoke_cs_id=XXXX&month=YYYY-MM
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const kaipokeCsId = searchParams.get('kaipoke_cs_id') ?? ''
    const month = searchParams.get('month') ?? ''

    console.info('[shifts][GET] kaipoke_cs_id=', kaipokeCsId, ' month=', month)

    if (!kaipokeCsId || !month) {
      return json({ error: 'kaipoke_cs_id and month are required' }, 400)
    }

    const m = month.match(/^(\d{4})-(\d{2})$/)
    if (!m) return json({ error: 'month must be YYYY-MM' }, 400)

    const year = Number(m[1])
    const mon = Number(m[2]) // 1..12
    const startDate = new Date(Date.UTC(year, mon - 1, 1))
    const endDate = new Date(Date.UTC(year, mon, 1))
    const fmt = (d: Date) => d.toISOString().slice(0, 10) // YYYY-MM-DD
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

// === POST /api/shifts : 新規作成（public.shift） ===
export async function POST(req: Request) {
  try {
    const actorUserIdText = await resolveActorUserIdText(req)
    if (!actorUserIdText) return json({ error: { message: "unauthorized" } }, 401)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][POST] actorUserIdText', actorUserIdText, 'path', requestPath)

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

    // ★ insert は RPC 経由（監査コンテキスト付与）
    const { data, error: rpcErr } = await supabaseAdmin.rpc('shifts_insert_with_context', {
      p_row: row,
      p_actor_user_id: actorUserIdText,
      p_request_path: requestPath,
    })

    if (rpcErr) {
      const code = (rpcErr as { code?: string }).code ?? null
      return json({ error: { code, message: rpcErr.message } }, 400)
    }

    // rpc は shift_id を返す想定
    const shiftId =
      (data as { shift_id?: number } | null)?.shift_id ??
      (typeof data === 'number' ? data : null)

    if (!shiftId) {
      return json({ error: { message: 'rpc did not return shift_id' } }, 500)
    }

    try {
      const { data: s } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, staff_01_user_id")
        .eq("shift_id", shiftId)
        .maybeSingle();

      if (s) {
        await notifyShiftChange({
          action: "INSERT",
          requestPath,
          actorUserIdText,
          shift: {
            shift_id: s.shift_id,
            kaipoke_cs_id: s.kaipoke_cs_id,
            shift_start_date: s.shift_start_date,
            shift_start_time: s.shift_start_time,
            shift_end_time: s.shift_end_time,
            staff_01_user_id: s.staff_01_user_id,
          },
        })
      }
    } catch (e) {
      console.warn("[shifts][POST] notify failed", e)
    }
    
    return json({ shift_id: shiftId, table: 'shift' }, 201)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][POST] unhandled error', err)
    return json({ error: err }, 500)
  }
}

// === PUT /api/shifts : 更新 ===
export async function PUT(req: Request) {
  try {
    const actorUserIdText = await resolveActorUserIdText(req)
    if (!actorUserIdText) return json({ error: { message: "unauthorized" } }, 401)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][PUT] actorUserIdText', actorUserIdText, 'path', requestPath)

    const raw = (await req.json()) as Record<string, unknown>
    const idVal = raw['shift_id'] ?? raw['id']
    const id = typeof idVal === 'string' ? Number(idVal) : typeof idVal === 'number' ? idVal : null

    const patch: Record<string, unknown> = {}

    const setIf = (k: string, v: unknown) => {
      if (v !== undefined) patch[k] = v
    }

    setIf('shift_start_date', raw['shift_start_date'] as string | undefined)
    setIf('shift_end_date', raw['shift_end_date'] as string | undefined)
    if (raw['shift_start_time'] !== undefined) patch['shift_start_time'] = toHMS(String(raw['shift_start_time']))
    if (raw['shift_end_time'] !== undefined) patch['shift_end_time'] = toHMS(String(raw['shift_end_time']))

      ; (
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

    if (Object.keys(patch).length === 0) {
      return json({ error: { message: 'no fields to update' } }, 400)
    }

    // =========================
    // ★ ここからが差し替えポイント
    // =========================

    // 1) shift_id があるならそれで更新（RPC）
    if (id != null) {
      const { error: rpcErr } = await supabaseAdmin.rpc('shifts_update_with_context', {
        p_shift_id: id,
        p_patch: patch,
        p_actor_user_id: actorUserIdText,
        p_request_path: requestPath,
      })

      if (rpcErr) {
        const code = (rpcErr as { code?: string }).code ?? null
        return json({ error: { code, message: rpcErr.message } }, 400)
      }

      return json({ ok: true, shift_id: id })
    }

    // 2) 複合キーしか無い場合：まず shift_id を引いてからRPCで更新
    const cs = raw['kaipoke_cs_id'] as string | undefined
    const sd = raw['shift_start_date'] as string | undefined
    const st = raw['shift_start_time'] as string | undefined

    if (cs && sd && st) {
      const { data: found, error: selErr } = await supabaseAdmin
        .from('shift')
        .select('shift_id')
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)))
        .single()

      if (selErr || !found) {
        return json({ error: { message: selErr?.message ?? 'shift not found' } }, 400)
      }

      const foundId = (found as { shift_id: number }).shift_id

      const { error: rpcErr } = await supabaseAdmin.rpc('shifts_update_with_context', {
        p_shift_id: foundId,
        p_patch: patch,
        p_actor_user_id: actorUserIdText,
        p_request_path: requestPath,
      })

      if (rpcErr) {
        const code = (rpcErr as { code?: string }).code ?? null
        return json({ error: { code, message: rpcErr.message } }, 400)
      }

      return json({ ok: true, shift_id: foundId })
    }

    // RPC成功後、最新のシフトを取得して通知（失敗しても本処理は成功扱い）
    try {
      const { data: s } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, staff_01_user_id")
        .eq("shift_id", id)
        .maybeSingle();

      if (s) {
        await notifyShiftChange({
          action: "UPDATE",
          requestPath,
          actorUserIdText,
          shift: {
            shift_id: s.shift_id,
            kaipoke_cs_id: s.kaipoke_cs_id,
            shift_start_date: s.shift_start_date,
            shift_start_time: s.shift_start_time,
            shift_end_time: s.shift_end_time,
            staff_01_user_id: s.staff_01_user_id,
          },
        })
      }
    } catch (e) {
      console.warn("[shifts][PUT] notify failed", e)
    }

    return json({ error: { message: 'missing shift_id (or composite keys)' } }, 400)
  } catch (e: unknown) {
    const err = e instanceof Error ? { message: e.message, stack: e.stack } : { message: String(e ?? 'unknown') }
    console.error('[shifts][PUT] unhandled error', err)
    return json({ error: err }, 500)
  }
}

// === DELETE /api/shifts : 削除 ===
// === DELETE /api/shifts : 削除 ===
export async function DELETE(req: Request) {
  try {
    const actorUserIdText = await resolveActorUserIdText(req)
    if (!actorUserIdText) return json({ error: { message: "unauthorized" } }, 401)
    const requestPath = resolveRequestPath(req)
    console.info('[shifts][DELETE] actorUserIdText', actorUserIdText, 'path', requestPath)

    const raw = (await req.json()) as Record<string, unknown>

    // -------------------------
    // 1) 複数ID
    // -------------------------
    if (Array.isArray(raw['ids'])) {
      const ids = (raw['ids'] as unknown[])
        .map((v) => (typeof v === 'string' ? Number(v) : v))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))

      if (ids.length === 0) return json({ error: { message: 'ids is empty' } }, 400)

      // ★削除前に確保（通知用）
      const { data: beforeShifts, error: beforeErr } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, staff_01_user_id")
        .in("shift_id", ids)

      if (beforeErr) console.warn("[shifts][DELETE] beforeShifts fetch error", beforeErr)

      // ★削除（監査つき）
      const { error: rpcErr } = await supabaseAdmin.rpc('shifts_delete_with_context', {
        p_shift_ids: ids,
        p_actor_user_id: actorUserIdText,
        p_request_path: requestPath,
      })

      if (rpcErr) {
        const code = (rpcErr as { code?: string }).code ?? null
        return json({ error: { code, message: rpcErr.message } }, 400)
      }

      // ★通知（分岐の中でやる：スコープ問題なし）
      try {
        for (const s of beforeShifts ?? []) {
          await notifyShiftChange({
            action: "DELETE",
            requestPath,
            actorUserIdText,
            shift: {
              shift_id: s.shift_id,
              kaipoke_cs_id: s.kaipoke_cs_id,
              shift_start_date: s.shift_start_date,
              shift_start_time: s.shift_start_time,
              shift_end_time: s.shift_end_time,
              staff_01_user_id: s.staff_01_user_id,
            },
            deleteChangedCols: {
              shift_start_date: s.shift_start_date,
              shift_start_time: s.shift_start_time,
              staff_01_user_id: s.staff_01_user_id,
              kaipoke_cs_id: s.kaipoke_cs_id,
              shift_id: s.shift_id,
            },
          })
        }
      } catch (e) {
        console.warn("[shifts][DELETE] notify failed", e)
      }

      return json({ ok: true, count: ids.length })
    }

    // -------------------------
    // 2) 単一ID
    // -------------------------
    const idVal = raw['shift_id'] ?? raw['id']
    if (idVal != null) {
      const id = typeof idVal === 'string' ? Number(idVal) : (idVal as number)
      if (!Number.isFinite(id)) return json({ error: { message: 'invalid id' } }, 400)

      // ★削除前に 1件確保（通知用）
      const { data: beforeShift, error: beforeErr } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, staff_01_user_id")
        .eq("shift_id", id)
        .maybeSingle()

      if (beforeErr) console.warn("[shifts][DELETE] beforeShift fetch error", beforeErr)

      // ★削除（監査つき）
      const { error: rpcErr } = await supabaseAdmin.rpc('shifts_delete_with_context', {
        p_shift_ids: [id],
        p_actor_user_id: actorUserIdText,
        p_request_path: requestPath,
      })

      if (rpcErr) {
        const code = (rpcErr as { code?: string }).code ?? null
        return json({ error: { code, message: rpcErr.message } }, 400)
      }

      // ★通知（ここで完結させる）
      try {
        if (beforeShift) {
          await notifyShiftChange({
            action: "DELETE",
            requestPath,
            actorUserIdText,
            shift: {
              shift_id: beforeShift.shift_id,
              kaipoke_cs_id: beforeShift.kaipoke_cs_id,
              shift_start_date: beforeShift.shift_start_date,
              shift_start_time: beforeShift.shift_start_time,
              shift_end_time: beforeShift.shift_end_time,
              staff_01_user_id: beforeShift.staff_01_user_id,
            },
            deleteChangedCols: {
              shift_start_date: beforeShift.shift_start_date,
              shift_start_time: beforeShift.shift_start_time,
              staff_01_user_id: beforeShift.staff_01_user_id,
              kaipoke_cs_id: beforeShift.kaipoke_cs_id,
              shift_id: beforeShift.shift_id,
            },
          })
        }
      } catch (e) {
        console.warn("[shifts][DELETE] notify failed", e)
      }

      return json({ ok: true, count: 1 })
    }

    // -------------------------
    // 3) 複合キー指定（shift_id を引いてから削除）
    // -------------------------
    const cs = raw['kaipoke_cs_id'] as string | undefined
    const sd = raw['shift_start_date'] as string | undefined
    const st = raw['shift_start_time'] as string | undefined

    if (cs && sd && st) {
      const { data: found, error: selErr } = await supabaseAdmin
        .from('shift')
        .select('shift_id')
        .eq('kaipoke_cs_id', cs)
        .eq('shift_start_date', sd)
        .eq('shift_start_time', toHMS(String(st)))
        .single()

      if (selErr || !found) {
        return json({ error: { message: selErr?.message ?? 'shift not found' } }, 400)
      }

      const foundId = (found as { shift_id: number }).shift_id

      // ★削除前に 1件確保（通知用）
      const { data: beforeShift, error: beforeErr } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, staff_01_user_id")
        .eq("shift_id", foundId)
        .maybeSingle()

      if (beforeErr) console.warn("[shifts][DELETE] beforeShift fetch error", beforeErr)

      // ★削除（監査つき）
      const { error: rpcErr } = await supabaseAdmin.rpc('shifts_delete_with_context', {
        p_shift_ids: [foundId],
        p_actor_user_id: actorUserIdText,
        p_request_path: requestPath,
      })

      if (rpcErr) {
        const code = (rpcErr as { code?: string }).code ?? null
        return json({ error: { code, message: rpcErr.message } }, 400)
      }

      // ★通知
      try {
        if (beforeShift) {
          await notifyShiftChange({
            action: "DELETE",
            requestPath,
            actorUserIdText,
            shift: {
              shift_id: beforeShift.shift_id,
              kaipoke_cs_id: beforeShift.kaipoke_cs_id,
              shift_start_date: beforeShift.shift_start_date,
              shift_start_time: beforeShift.shift_start_time,
              shift_end_time: beforeShift.shift_end_time,
              staff_01_user_id: beforeShift.staff_01_user_id,
            },
            deleteChangedCols: {
              shift_start_date: beforeShift.shift_start_date,
              shift_start_time: beforeShift.shift_start_time,
              staff_01_user_id: beforeShift.staff_01_user_id,
              kaipoke_cs_id: beforeShift.kaipoke_cs_id,
              shift_id: beforeShift.shift_id,
            },
          })
        }
      } catch (e) {
        console.warn("[shifts][DELETE] notify failed", e)
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

