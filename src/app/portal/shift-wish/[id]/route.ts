// src/app/api/shift-wish/[id]/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 注意 環境変数はVercel等のプロジェクト設定に登録してください
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // RLSを気にせず確実に削除する場合は service_role を使用
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // 実テーブルを削除 ビューではなく shift-wish に対して実行
  const { error } = await supabase.from('shift-wish').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 本文無しで成功を返却
  return NextResponse.json({ success: true, id }, { status: 200 });
}
