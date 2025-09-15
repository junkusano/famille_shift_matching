// =============================
// app/api/taimee-emp/save/route.ts（新規）
// メモ / ブラック / 送信しない を変更保存
// 保存先は元テーブル taimee_employees_monthly（同一キー行へ）
// ※ period_month + taimee_user_id をキーに UPDATE
// =============================
import { NextResponse as Next } from 'next/server'
import { createClient as createSb } from '@supabase/supabase-js'

interface UpdateRowPayload { key: string; memo?: string; black_list?: boolean; send_disabled?: boolean }

export async function POST(req: Request) {
  try {
    const supabase = createSb(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const body: unknown = await req.json()
    const updates = (body as { updates: UpdateRowPayload[] }).updates
    if (!Array.isArray(updates)) return Next.json({ ok: false, error: 'invalid payload' }, { status: 400 })

    let updated = 0
    for (const u of updates) {
      if (!u?.key) continue
      const [period_month, taimee_user_id] = u.key.split('__')
      const patch: Partial<Pick<UpdateRowPayload, 'memo' | 'black_list' | 'send_disabled'>> = {}
      if (typeof u.memo !== 'undefined') patch.memo = u.memo
      if (typeof u.black_list !== 'undefined') patch.black_list = u.black_list
      if (typeof u.send_disabled !== 'undefined') patch.send_disabled = u.send_disabled
      if (Object.keys(patch).length === 0) continue
      const { error } = await supabase
        .from('taimee_employees_monthly')
        .update(patch)
        .eq('period_month', period_month)
        .eq('taimee_user_id', taimee_user_id)
      if (error) throw error
      updated++
    }

    return Next.json({ ok: true, updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return Next.json({ ok: false, error: msg }, { status: 500 })
  }
}
