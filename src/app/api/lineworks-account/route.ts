import { createSupabaseServerClient } from '@/lib/supabaseServer';
import getAccessToken from '@/lib/getAccessToken';
import { createLineWorksUser } from '@/lib/lineworksService';

export async function POST(req: Request) {
  try {
    const { userId, name, email } = await req.json();

    const supabase = await createSupabaseServerClient();
    const accessToken = await getAccessToken();

    const result = await createLineWorksUser(accessToken, userId, name, email);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), { status: 500 });
    }

    const { error } = await supabase
      .from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', userId);

    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
}
