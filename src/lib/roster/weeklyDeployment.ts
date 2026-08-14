import { supabaseAdmin } from '@/lib/supabase/service'
import type { ShiftRow, ShiftWeeklyTemplate } from '@/types/shift-weekly-template'
import { shouldDeployTemplateOnDate, weekdayOf } from './weeklyRecurrence'

export type DeployPolicy = 'skip_conflict' | 'overwrite_only' | 'delete_month_insert'

export function isDeployPolicy(value: unknown): value is DeployPolicy {
  return value === 'skip_conflict' || value === 'overwrite_only' || value === 'delete_month_insert'
}

export interface ExistingShift extends ShiftRow { shift_id: number }

export interface Candidate extends ShiftRow { template_id: number }

const shiftColumns = 'shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,service_code,required_staff_count,two_person_work_flg,judo_ido,staff_01_user_id,staff_02_user_id,staff_03_user_id,staff_02_attend_flg,staff_03_attend_flg,staff_01_role_code,staff_02_role_code,staff_03_role_code'

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) throw new Error('month は YYYY-MM 形式で指定してください')
  const start = `${month}-01`
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  return { start, end }
}

export function monthDates(month: string): string[] {
  const { start, end } = monthBounds(month)
  const result: string[] = []
  for (let date = new Date(`${start}T00:00:00Z`); date.toISOString().slice(0, 10) <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    result.push(date.toISOString().slice(0, 10))
  }
  return result
}

function toShiftRow(template: ShiftWeeklyTemplate, date: string): ShiftRow {
  return {
    kaipoke_cs_id: template.kaipoke_cs_id, shift_start_date: date,
    shift_start_time: template.start_time, shift_end_time: template.end_time,
    service_code: template.service_code, required_staff_count: template.required_staff_count,
    two_person_work_flg: template.two_person_work_flg, judo_ido: template.judo_ido,
    staff_01_user_id: template.staff_01_user_id, staff_02_user_id: template.staff_02_user_id,
    staff_03_user_id: template.staff_03_user_id, staff_02_attend_flg: template.staff_02_attend_flg,
    staff_03_attend_flg: template.staff_03_attend_flg, staff_01_role_code: template.staff_01_role_code,
    staff_02_role_code: template.staff_02_role_code, staff_03_role_code: template.staff_03_role_code,
  }
}

async function previousServiceDates(templates: ShiftWeeklyTemplate[], before: string): Promise<Map<number, string | null>> {
  const results = await Promise.all(templates.filter((t) => t.is_biweekly && !(t.nth_weeks?.length)).map(async (template) => {
    let query = supabaseAdmin.from('shift').select('shift_start_date,shift_start_time,shift_end_time,service_code,required_staff_count')
      .eq('kaipoke_cs_id', template.kaipoke_cs_id).lt('shift_start_date', before)
      .eq('shift_start_time', template.start_time).eq('shift_end_time', template.end_time)
      .eq('service_code', template.service_code).eq('required_staff_count', template.required_staff_count)
      .order('shift_start_date', { ascending: false }).limit(1)
    const { data, error } = await query
    if (error) throw new Error(`過去の隔週サービス日の取得に失敗しました: ${error.message}`)
    return [template.template_id, data?.[0]?.shift_start_date ?? null] as const
  }))
  return new Map(results)
}

export async function loadDeploymentInput(cs: string, month: string) {
  const { start, end } = monthBounds(month)
  const [templatesResult, existingResult] = await Promise.all([
    supabaseAdmin.from('shift_weekly_template').select('*').eq('kaipoke_cs_id', cs).eq('active', true),
    supabaseAdmin.from('shift').select(shiftColumns).eq('kaipoke_cs_id', cs).gte('shift_start_date', start).lte('shift_start_date', end),
  ])
  if (templatesResult.error) throw new Error(`テンプレートの取得に失敗しました: ${templatesResult.error.message}`)
  if (existingResult.error) throw new Error(`既存シフトの取得に失敗しました: ${existingResult.error.message}`)
  const templates = templatesResult.data as ShiftWeeklyTemplate[]
  const existing = existingResult.data as ExistingShift[]
  return { templates, existing, previousDates: await previousServiceDates(templates, start) }
}

export function buildCandidates(month: string, templates: ShiftWeeklyTemplate[], previousDates: Map<number, string | null>) {
  const candidates: Candidate[] = []
  const warnings: string[] = []
  for (const date of monthDates(month)) {
    for (const template of templates) {
      if (template.weekday !== weekdayOf(date)) continue
      const decision = shouldDeployTemplateOnDate(template, date, previousDates.get(template.template_id) ?? null)
      if (decision.reason && !warnings.includes(decision.reason)) warnings.push(`テンプレート ${template.template_id}: ${decision.reason}`)
      if (decision.include) candidates.push({ ...toShiftRow(template, date), template_id: template.template_id })
    }
  }
  return { candidates, warnings }
}

function minutes(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m }
function overlaps(a: Pick<ShiftRow, 'shift_start_time' | 'shift_end_time'>, b: Pick<ShiftRow, 'shift_start_time' | 'shift_end_time'>) {
  const aStart = minutes(a.shift_start_time); const bStart = minutes(b.shift_start_time)
  const aEnd = minutes(a.shift_end_time) <= aStart ? minutes(a.shift_end_time) + 1440 : minutes(a.shift_end_time)
  const bEnd = minutes(b.shift_end_time) <= bStart ? minutes(b.shift_end_time) + 1440 : minutes(b.shift_end_time)
  return aStart < bEnd && bStart < aEnd
}

export function candidatesForPolicy(candidates: Candidate[], existing: ExistingShift[], policy: DeployPolicy): Candidate[] {
  if (policy !== 'skip_conflict') return candidates
  return candidates.filter((candidate) => !existing.some((shift) => shift.shift_start_date === candidate.shift_start_date && overlaps(candidate, shift)))
}

export async function deployForClient(cs: string, month: string, policy: DeployPolicy) {
  const { templates, existing, previousDates } = await loadDeploymentInput(cs, month)
  const { candidates, warnings } = buildCandidates(month, templates, previousDates)
  const inserts = candidatesForPolicy(candidates, existing, policy)
  let deletedCount = 0
  if (policy === 'delete_month_insert') {
    const { start, end } = monthBounds(month)
    const { error } = await supabaseAdmin.from('shift').delete().eq('kaipoke_cs_id', cs).gte('shift_start_date', start).lte('shift_start_date', end)
    if (error) throw new Error(`対象月シフトの削除に失敗しました: ${error.message}`)
    deletedCount = existing.length
  } else if (policy === 'overwrite_only') {
    const ids = existing.filter((shift) => candidates.some((candidate) => candidate.shift_start_date === shift.shift_start_date && overlaps(candidate, shift))).map((shift) => shift.shift_id)
    if (ids.length) {
      const { error } = await supabaseAdmin.from('shift').delete().in('shift_id', ids)
      if (error) throw new Error(`競合シフトの削除に失敗しました: ${error.message}`)
      deletedCount = ids.length
    }
  }
  if (inserts.length) {
    const { error } = await supabaseAdmin.from('shift').insert(inserts.map(({ template_id: _templateId, ...row }) => row))
    if (error) throw new Error(`シフトの追加に失敗しました: ${error.message}`)
  }
  return { inserted_count: inserts.length, deleted_count: deletedCount, updated_count: 0, candidate_count: candidates.length, warnings }
}
