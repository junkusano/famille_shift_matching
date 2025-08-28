import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

type Option = { value: string; label: string }

export async function GET() {
  // category 固定で certificate のみ
  const { data: rows, error } = await supabaseAdmin
    .from('user_doc_master')
    .select('doc_group, sort_order')
    .eq('category', 'certificate')
    .neq('doc_group', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = { doc_group: string | null; sort_order: number | null }

  // doc_group ごとに最小 sort_order を採用
  const bucket = new Map<string, number | null>()
  for (const r of (rows ?? []) as Row[]) {
    if (!r.doc_group) continue
    const cur = bucket.get(r.doc_group)
    const s = r.sort_order
    if (cur === undefined) {
      bucket.set(r.doc_group, s ?? null)
    } else if (s != null && (cur == null || s < cur)) {
      bucket.set(r.doc_group, s)
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
