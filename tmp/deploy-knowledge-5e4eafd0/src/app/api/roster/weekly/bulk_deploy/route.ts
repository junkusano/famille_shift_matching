import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'
import { deployForClient, isDeployPolicy, type DeployPolicy } from '@/lib/roster/weeklyDeployment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type BulkDeployRequest = { month?: string; policy?: DeployPolicy; recurrence?: boolean }

export async function POST(req: Request) {
  try {
    const body = await req.json() as BulkDeployRequest
    if (!body.month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
      return NextResponse.json({ error: 'month は YYYY-MM 形式で指定してください' }, { status: 400 })
    }
    if (body.policy && !isDeployPolicy(body.policy)) return NextResponse.json({ error: '不正な展開ポリシーです' }, { status: 400 })
    const policy = body.policy ?? 'skip_conflict'
    const { data, error } = await supabaseAdmin.from('shift_weekly_template').select('kaipoke_cs_id').eq('active', true)
    if (error) throw new Error(`テンプレート対象の取得に失敗しました: ${error.message}`)
    const clients = [...new Set((data ?? []).map((row) => row.kaipoke_cs_id).filter(Boolean))]
    const results = []
    for (const cs of clients) results.push({ kaipoke_cs_id: cs, ...(await deployForClient(cs, body.month, policy)) })
    const sum = (field: 'inserted_count' | 'deleted_count' | 'updated_count' | 'candidate_count') => results.reduce((total, result) => total + result[field], 0)
    return NextResponse.json({ success: true, month: body.month, applied_policy: policy, recurrence_ignored: body.recurrence === false, inserted_count: sum('inserted_count'), deleted_count: sum('deleted_count'), updated_count: sum('updated_count'), candidate_count: sum('candidate_count'), results })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
