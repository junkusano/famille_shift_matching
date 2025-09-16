// api/shifts/route.ts
import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kaipokeCsId = searchParams.get('kaipoke_cs_id');
  const month = searchParams.get('month');

  console.log(`GET request to /api/shifts with kaipoke_cs_id=${kaipokeCsId} and month=${month}`);

  if (!kaipokeCsId || !month) {
    console.log('Missing required parameters: kaipoke_cs_id or month');
    return new Response(JSON.stringify({ error: 'kaipoke_cs_id and month are required' }), { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('shift_csinfo_postalname_view')  // シフト情報を取得
    .select('*')
    .eq('kaipoke_cs_id', kaipokeCsId)  // 利用者IDでフィルタリング
    .like('shift_start_date', `${month}%`)  // 月でフィルタリング（例: 202309）
    .order('shift_start_date', { ascending: true });  // 日付順に並べる

  if (error) {
    console.error('Supabase GET error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log('Fetched shift data:', data);
  return new Response(JSON.stringify(data), { status: 200 });
}

export async function PUT(req: Request) {
  const { shift_id, ...updatedFields } = await req.json();

  console.log('PUT request to /api/shifts with shift_id:', shift_id);

  if (!shift_id) {
    console.log('Missing shift_id');
    return new Response(JSON.stringify({ error: 'shift_id is required' }), { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('shift')  // シフトテーブルに更新
    .update(updatedFields)
    .eq('shift_id', shift_id)
    .single();

  if (error) {
    console.error('Supabase PUT error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  console.log('Updated shift data:', data);
  return new Response(JSON.stringify(data), { status: 200 });
}
