//api/users/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET() {
  console.log('GET request to /api/users');
  
  const { data, error } = await supabaseAdmin
    .from('user_entry_united_view_single')  // ユーザー情報を取得
    .select('*')

  if (error) {
    console.error('Supabase GET error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log('Fetched user data:', data);
  return new Response(JSON.stringify(data), { status: 200 });
}
