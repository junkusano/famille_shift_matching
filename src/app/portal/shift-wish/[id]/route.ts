import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ★ server only：環境変数で安全に
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // 削除は管理操作なので service_role を推奨（RLSを気にしない）
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // 実テーブルに対して削除（一覧は view を読んでOK）
  const { error } = await supabase
    .from('shift-wish')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 204で返す（ボディなし）
  return new NextResponse(null, { status: 204 })
}
