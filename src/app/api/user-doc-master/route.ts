// api/user-doc-master/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type Option = { value: string; label: string }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category') ?? 'certificate'

  // ① 契約書・プラン用：cs_doc → id / label をそのまま返す
  if (category === 'cs_doc') {
    const { data, error } = await supabaseAdmin
      .from('user_doc_master')
      .select('id, label')
      .eq('category', 'cs_doc')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const options: Option[] = (data ?? []).map((r) => ({
      value: r.id,     // ★ uuid
      label: r.label,  // 表示名
    }))

    return NextResponse.json(options)
  }

  // ② 証明書グループ用：既存の certificate の doc_group 集約
  const { data: rows, error } = await supabaseAdmin
    .from('user_doc_master')
    .select('doc_group, sort_order')
    .eq('category', 'certificate')
    .neq('doc_group', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // doc_group ごとに sort_order の最小値を持つ
  const bucket = new Map<string, number | null>()
  for (const r of rows ?? []) {
    const group = r.doc_group as string | null
    const s = (r as any).sort_order as number | null
    if (!group) continue
    const cur = bucket.get(group)
    if (cur == null) {
      bucket.set(group, s ?? null)
    } else if (s != null && (cur == null || s < cur)) {
      bucket.set(group, s)
    }
  }

  // 並び替え（sort_order → doc_group）
  const grouped = Array.from(bucket.entries())
    .map(([group, s]) => ({ group, s: s ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => (a.s === b.s ? a.group.localeCompare(b.group, 'ja') : a.s - b.s))

  // options に変換
  const options: Option[] = grouped.map(({ group }) => ({
    value: group,
    label: group,
  }))

  return NextResponse.json(options)
}
