// C:\Users\USER\famille_shift_matching\src\app\portal\shift-wish\[id]\route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ※ 環境変数はプロジェクト設定に登録しておくこと
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // RLS無視で確実に削除する場合は service_role を使用（クライアントには絶対に渡さない）
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Next.js 15 では { params } が Promise 型
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // 実テーブルに対して削除（ビューではなく "shift-wish"）
  const { error } = await supabase.from('shift-wish').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id }, { status: 200 })
}
