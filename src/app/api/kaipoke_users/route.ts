// /api/kaipoke-users/route.ts

import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('cs_kaipoke_info')  // 利用者情報を取得
    .select('kaipoke_cs_id, name')  // 必要なカラムのみを選択
    .order('name', { ascending: true })  // 名前順に並べ替え

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
}
