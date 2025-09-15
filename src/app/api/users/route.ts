//api/users/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('user_entry_united_view_single')  // ユーザー情報を取得
    .select('*')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
}
