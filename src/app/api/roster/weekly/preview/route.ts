// src/app/api/roster/weekly/preview/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftWeeklyTemplate, ShiftRow } from '@/types/shift-weekly-template'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type DeployPolicy = 'skip_conflict' | 'overwrite_only' | 'delete_month_insert'

// 既存シフト（プレビュー表示に必要な最小セット + なるべくShiftRow互換）
interface ExistingShift {
  shift_id: string
  kaipoke_cs_id: string
  shift_start_date: string
  shift_start_time: string
  shift_end_time: string
  service_code: string | null
  required_staff_count: number | null
  two_person_work_flg: boolean | null
  judo_ido: string | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean | null
  staff_03_attend_flg: boolean | null
  staff_01_role_code?: string | null
  staff_02_role_code?: string | null
  staff_03_role_code?: string | null
}

// ---- helpers ----
const fmtDate = (d: Date) => d.toISOString().slice(0, 10)

const toHM = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// 24h区間に正規化（翌日またぎは end += 1440）
const normalizeRange = (startMin: number, endMin: number) => {
  const s = startMin
  const e = endMin <= startMin ? endMin + 1440 : endMin
  return [s, e] as const
}

const isOverlapSameDay = (s1: number, e1: number, s2: number, e2: number) => {
  const [ns1, ne1] = normalizeRange(s1, e1)
  const [ns2, ne2] = normalizeRange(s2, e2)
  return ns1 < ne2 && ns2 < ne1
}

const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m!, 0)
  return { start, end, startStr: fmtDate(start), endStr: fmtDate(end) }
}

function* eachDay(start: Date, end: Date): Generator<Date> {
  const cur = new Date(start)
  while (cur <= end) {
    yield new Date(cur)
    cur.setDate(cur.getDate() + 1)
  }
}

const nthOfMonth = (d: Date) => Math.floor((d.getDate() - 1) / 7) + 1

const isBiweeklyHit = (date: Date, effectiveFrom: string | null): boolean => {
  const anchor = effectiveFrom ? new Date(effectiveFrom + 'T00:00:00') : date
  const diffDays = Math.floor((date.getTime() - anchor.getTime()) / 86_400_000)
  const weeks = Math.floor(diffDays / 7)
  return weeks % 2 === 0
}

async function handlePreview(cs: string, month: string, policy: DeployPolicy, useRecurrence: boolean) {
  console.log('[weekly/preview] START', { cs, month, policy, useRecurrence })

  // 1) テンプレ取得
  const tplRes = await supabaseAdmin
    .from('shift_weekly_template')
    .select('*')
    .eq('kaipoke_cs_id', cs)
    .eq('active', true)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })

  if (tplRes.error) {
    console.error('[weekly/preview] templates error:', tplRes.error)
    return NextResponse.json({ error: tplRes.error.message }, { status: 500 })
  }
  const templates: ShiftWeeklyTemplate[] = (tplRes.data ?? []) as ShiftWeeklyTemplate[]
  console.log('[weekly/preview] templates count =', templates.length)

  const { start, end, startStr, endStr } = monthRange(month)
  console.log('[weekly/preview] month range =', { startStr, endStr })

  // 2) 対象月の既存シフト（できるだけShiftRow互換に揃える）
  const existRes = await supabaseAdmin
    .from('shift')
    .select([
      'shift_id',
      'kaipoke_cs_id',
      'shift_start_date',
      'shift_start_time',
      'shift_end_time',
      'service_code',
      'required_staff_count',
      'two_person_work_flg',
      'judo_ido',
      'staff_01_user_id',
      'staff_02_user_id',
      'staff_03_user_id',
      'staff_02_attend_flg',
      'staff_03_attend_flg',
      'staff_01_role_code',
      'staff_02_role_code',
      'staff_03_role_code',
    ].join(','))
    .eq('kaipoke_cs_id', cs)
    .gte('shift_start_date', startStr)
    .lte('shift_start_date', endStr)

  if (existRes.error) {
    console.error('[weekly/preview] existing shifts error:', existRes.error)
    return NextResponse.json({ error: existRes.error.message }, { status: 500 })
  }
  const existing: ExistingShift[] = (existRes.data ?? []) as unknown as ExistingShift[]
  console.log('[weekly/preview] existing shift count =', existing.length)

  // 3) テンプレ候補生成（recurrenceがtrueのときのみ is_biweekly / nth_weeks を評価）
  const candRows: (ShiftRow & { has_conflict: boolean; is_template: true; will_be_deleted: false; action: 'new' | 'new_conflict' })[] = []

  // 3.1) 既存シフトと衝突判定するためのマップを準備 (高速化のため)
  const existingMap = new Map<string, ExistingShift[]>();
  existing.forEach(s => {
    const date = s.shift_start_date;
    if (!existingMap.has(date)) {
      existingMap.set(date, []);
    }
    existingMap.get(date)!.push(s);
  });

  for (const date of eachDay(start, end)) {
    const dow = date.getDay()
    const nth = nthOfMonth(date)
    const ymd = fmtDate(date)

    const existingShiftsOnDay = existingMap.get(ymd) || []; // その日の既存シフト

    for (const t of templates) {
      if (t.weekday !== dow) continue

      // 有効期間チェック
      if (t.effective_from && ymd < t.effective_from) continue
      if (t.effective_to && ymd > t.effective_to) continue

      // recurrence（隔週・第n週）評価
      if (useRecurrence) {
        if (t.is_biweekly === true && !isBiweeklyHit(date, t.effective_from)) continue
        if (t.nth_weeks && t.nth_weeks.length > 0 && !t.nth_weeks.includes(nth)) continue
      }

      const cand: ShiftRow = {
        kaipoke_cs_id: t.kaipoke_cs_id,
        shift_start_date: ymd,
        shift_start_time: t.start_time,
        shift_end_time: t.end_time,
        service_code: t.service_code,
        required_staff_count: t.required_staff_count,
        two_person_work_flg: t.two_person_work_flg,
        judo_ido: t.judo_ido,
        staff_01_user_id: t.staff_01_user_id,
        staff_02_user_id: t.staff_02_user_id,
        staff_03_user_id: t.staff_03_user_id,
        staff_02_attend_flg: t.staff_02_attend_flg,
        staff_03_attend_flg: t.staff_03_attend_flg,
        staff_01_role_code: t.staff_01_role_code,
        staff_02_role_code: t.staff_02_role_code,
        staff_03_role_code: t.staff_03_role_code,
      }

      const s1 = toHM(cand.shift_start_time)
      const e1 = toHM(cand.shift_end_time)

      const hasConflict = existingShiftsOnDay.some((z) =>
        isOverlapSameDay(s1, e1, toHM(z.shift_start_time), toHM(z.shift_end_time))
      )

      // policy=skip_conflict のときは重なりテンプレを除外
      if (policy === 'skip_conflict' && hasConflict) {
        continue // テンプレートシフトを破棄
      }

      // テンプレートシフトは全て candRows に追加される
      candRows.push({
        ...cand,
        has_conflict: hasConflict,
        is_template: true,
        will_be_deleted: false,
        action: hasConflict ? 'new_conflict' : 'new',
      })
    }
  }

  // 候補が1件もなければ、プレビューは既存シフトのフィルタリングなしで返す
  if (candRows.length === 0) {
    console.log('[weekly/preview] no candidates -> return only existing shifts')

    // テンプレート候補がない場合でも、既存シフトは対象期間の全件を返す
    // will_be_deleted=false, action='keep' を付与
    const simpleExistingRows = existing.map((z) => ({
      kaipoke_cs_id: z.kaipoke_cs_id,
      shift_start_date: z.shift_start_date,
      shift_start_time: z.shift_start_time,
      shift_end_time: z.shift_end_time,
      service_code: z.service_code ?? '',
      required_staff_count: z.required_staff_count ?? 1,
      two_person_work_flg: z.two_person_work_flg ?? false,
      judo_ido: z.judo_ido ?? null,
      staff_01_user_id: z.staff_01_user_id ?? null,
      staff_02_user_id: z.staff_02_user_id ?? null,
      staff_03_user_id: z.staff_03_user_id ?? null,
      staff_02_attend_flg: z.staff_02_attend_flg ?? false,
      staff_03_attend_flg: z.staff_03_attend_flg ?? false,
      staff_01_role_code: z.staff_01_role_code ?? null,
      staff_02_role_code: z.staff_02_role_code ?? null,
      staff_03_role_code: z.staff_03_role_code ?? null,
      is_template: false as const,
      has_conflict: false, // テンプレートがないのでコンフリクトなし
      conflict: false,
      shift_id: z.shift_id,
      will_be_deleted: false as const,
      action: 'keep' as const,
    }));

    // 日付/時間でソート
    simpleExistingRows.sort((a, b) =>
      a.shift_start_date === b.shift_start_date
        ? toHM(a.shift_start_time) - toHM(b.shift_start_time)
        : a.shift_start_date < b.shift_start_date
          ? -1
          : 1
    );

    return NextResponse.json({ rows: simpleExistingRows }, { status: 200 })
  }

  // 4) 既存シフトの出力方針
  // 🚨 修正箇所: 既存シフトのフィルタリングを削除
  // 全ての既存シフト(existing)に対して、will_be_deleted/action を付与する
  const existingRows = existing.map((z) => { // 変更: existingForDays -> existing

    // 既存シフトとテンプレートシフトのコンフリクトを再チェック
    const hasConflict = candRows.some(
      (c) =>
        c.shift_start_date === z.shift_start_date &&
        isOverlapSameDay(toHM(c.shift_start_time), toHM(c.shift_end_time), toHM(z.shift_start_time), toHM(z.shift_end_time))
    )

    const base = {
      kaipoke_cs_id: z.kaipoke_cs_id,
      shift_start_date: z.shift_start_date,
      shift_start_time: z.shift_start_time,
      shift_end_time: z.shift_end_time,
      service_code: z.service_code ?? '',
      required_staff_count: z.required_staff_count ?? 1,
      two_person_work_flg: z.two_person_work_flg ?? false,
      judo_ido: z.judo_ido ?? null,
      staff_01_user_id: z.staff_01_user_id ?? null,
      staff_02_user_id: z.staff_02_user_id ?? null,
      staff_03_user_id: z.staff_03_user_id ?? null,
      staff_02_attend_flg: z.staff_02_attend_flg ?? false,
      staff_03_attend_flg: z.staff_03_attend_flg ?? false,
      staff_01_role_code: z.staff_01_role_code ?? null,
      staff_02_role_code: z.staff_02_role_code ?? null,
      staff_03_role_code: z.staff_03_role_code ?? null,
      // 追加フラグ
      is_template: false as const,
      has_conflict: hasConflict,
      conflict: hasConflict, // 互換
      shift_id: z.shift_id,
    }

    if (policy === 'delete_month_insert') {
      return { ...base, will_be_deleted: true as const, action: 'delete' as const }
    }

    // overwrite_only / skip_conflict は既存は維持（削除しない）
    // NOTE: overwrite_only の場合、コンフリクトする既存シフトの action は 'keep' だが、
    // candRows 側で 'new_conflict' のテンプレートが上書きの役割を果たす。
    return { ...base, will_be_deleted: false as const, action: 'keep' as const }
  })

  // 5) 結合して日付/時間でソート
  const rows = [
    ...candRows.map((r) => ({
      ...r,
      conflict: r.has_conflict, // 互換
      shift_id: null as string | null,
    })),
    ...existingRows,
  ].sort((a, b) =>
    a.shift_start_date === b.shift_start_date
      ? toHM(a.shift_start_time) - toHM(b.shift_start_time)
      : a.shift_start_date < b.shift_start_date
        ? -1
        : 1
  )

  console.log('[weekly/preview] rows:', rows.length, '(cand:', candRows.length, 'existing:', existingRows.length, ')')
  return NextResponse.json({ rows }, { status: 200 })
}


// --- GET: /api/roster/weekly/preview?cs=...&month=YYYY-MM[&policy=...][&recurrence=true|false] ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const cs = searchParams.get('cs') || ''
  const month = searchParams.get('month') || ''
  const policy = (searchParams.get('policy') || 'skip_conflict') as DeployPolicy
  const recurrence = (searchParams.get('recurrence') || 'true').toLowerCase() === 'true'

  console.log('[weekly/preview][GET] query =', { cs, month, policy, recurrence })
  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }
  return handlePreview(cs, month, policy, recurrence)
}

// --- POST: body { cs, month, policy?, recurrence? } ---
export async function POST(req: Request) {
  let body: Partial<{ cs: string; month: string; policy: DeployPolicy; recurrence: boolean }>
  try {
    body = (await req.json()) as Partial<{ cs: string; month: string; policy: DeployPolicy; recurrence: boolean }>
  } catch {
    body = {}
  }
  const cs = body.cs || ''
  const month = body.month || ''
  const policy = (body.policy || 'skip_conflict') as DeployPolicy
  const recurrence = body.recurrence ?? true

  console.log('[weekly/preview][POST] body =', { cs, month, policy, recurrence })
  if (!cs || !month) {
    return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
  }
  return handlePreview(cs, month, policy, recurrence)
}
