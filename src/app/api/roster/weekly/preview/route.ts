import { NextResponse } from 'next/server'
import { buildCandidates, candidatesForPolicy, isDeployPolicy, loadDeploymentInput, type DeployPolicy } from '@/lib/roster/weeklyDeployment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function preview(cs: string, month: string, policy: DeployPolicy) {
  const { templates, existing, previousDates } = await loadDeploymentInput(cs, month)
  const { candidates, warnings } = buildCandidates(month, templates, previousDates)
  const visibleCandidates = candidatesForPolicy(candidates, existing, policy)
  const rows = [
    ...visibleCandidates.map(({ template_id: _templateId, ...row }) => ({ ...row, shift_id: null, is_template: true, has_conflict: false, conflict: false, will_be_deleted: false, action: 'new' as const })),
    ...existing.map((row) => ({ ...row, is_template: false, has_conflict: false, conflict: false, will_be_deleted: policy === 'delete_month_insert', action: policy === 'delete_month_insert' ? 'delete' as const : 'keep' as const })),
  ].sort((a, b) => a.shift_start_date.localeCompare(b.shift_start_date) || a.shift_start_time.localeCompare(b.shift_start_time))
  return NextResponse.json({ rows, warnings })
}

function paramsFromUrl(req: Request) {
  const query = new URL(req.url).searchParams
  return { cs: query.get('cs') ?? '', month: query.get('month') ?? '', policy: (query.get('policy') ?? 'skip_conflict') as DeployPolicy }
}

export async function GET(req: Request) {
  try {
    const { cs, month, policy } = paramsFromUrl(req)
    if (!cs || !month) return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
    if (!isDeployPolicy(policy)) return NextResponse.json({ error: '不正な展開ポリシーです' }, { status: 400 })
    return await preview(cs, month, policy)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { cs?: string; month?: string; policy?: DeployPolicy; recurrence?: boolean }
    if (!body.cs || !body.month) return NextResponse.json({ error: 'cs and month are required' }, { status: 400 })
    if (body.policy && !isDeployPolicy(body.policy)) return NextResponse.json({ error: '不正な展開ポリシーです' }, { status: 400 })
    return await preview(body.cs, body.month, body.policy ?? 'skip_conflict')
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
