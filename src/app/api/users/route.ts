//api/users/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('users')  // ユーザー情報を取得
    .select('user_id, last_name_kanji, first_name_kanji, qualifications')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
}
