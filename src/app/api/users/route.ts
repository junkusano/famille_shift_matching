// /src/app/api/users/route.ts
import { supabaseAdmin } from '@/lib/supabase/service';

export async function GET() {
  try {
    console.info('[users][GET] start');
    const { data, error } = await supabaseAdmin
      .from('user_entry_united_view_single')
      .select('*');

    if (error) {
      console.error('[users][GET] error', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    console.info('[users][GET] result count=', Array.isArray(data) ? data.length : 0);
    return new Response(JSON.stringify(data ?? []), { status: 200 });
  } catch (e: unknown) {
    console.error('[users][GET] unhandled error', e);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

