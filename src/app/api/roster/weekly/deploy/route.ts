import { NextResponse } from 'next/server'
import { deployForClient, isDeployPolicy, type DeployPolicy } from '@/lib/roster/weeklyDeployment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type DeployRequest = { month?: string; kaipoke_cs_id?: string; policy?: DeployPolicy; recurrence?: boolean; mode?: 'add' }

export async function POST(req: Request) {
  try {
    const body = await req.json() as DeployRequest
    if (!body.month || !body.kaipoke_cs_id) return NextResponse.json({ error: 'month と kaipoke_cs_id は必須です' }, { status: 400 })
    if (body.policy && !isDeployPolicy(body.policy)) return NextResponse.json({ error: '不正な展開ポリシーです' }, { status: 400 })
    if (body.mode && body.mode !== 'add') return NextResponse.json({ error: `未対応の展開モードです: ${body.mode}` }, { status: 400 })
    // recurrence=false は旧画面用の互換入力。テンプレートの設定を無効化しない。
    const result = await deployForClient(body.kaipoke_cs_id, body.month, body.policy ?? 'skip_conflict')
    return NextResponse.json({ ...result, recurrence_ignored: body.recurrence === false })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
