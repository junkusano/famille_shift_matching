//api/kaipoke-info

import { supabaseAdmin } from '@/lib/supabase/service';

export async function GET() {
  try {
    console.info('[kaipoke-info][GET] start');
    const { data, error } = await supabaseAdmin
      .from('cs_kaipoke_info')
      .select('*')                 // ← 必要十分。列不足事故を避ける
      .order('name', { ascending: true });

    if (error) {
      console.error('[kaipoke-info][GET] error', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    console.info('[kaipoke-info][GET] result count=', Array.isArray(data) ? data.length : 0);
    return new Response(JSON.stringify(data ?? []), { status: 200 });
  } catch (e: unknown) {
    console.error('[kaipoke-info][GET] unhandled error', e);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

