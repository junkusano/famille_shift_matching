import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getAccessToken } from '@/lib/getAccessToken';
import { createLineWorksUser } from '@/lib/lineworksService';

export async function POST(req: Request) {
  try {
    const { userId, name, email } = await req.json();

    if (!userId || !name || !email) {
      return new Response(
        JSON.stringify({ success: false, error: '必要な情報が不足しています。' }),
        { status: 400 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const accessToken = await getAccessToken();

    const result = await createLineWorksUser(accessToken, userId, name, email);

    if (result.success === false) {
      console.error('LINE WORKS ユーザー作成失敗:', result.error);
      return new Response(
        JSON.stringify({ success: false, error: result.error }),
        { status: 500 }
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ temp_password: result.tempPassword })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Supabase 更新エラー:', updateError.message);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true, tempPassword: result.tempPassword }),
      { status: 200 }
    );

  } catch (err: unknown) {
    console.error('API処理中エラー:', err);
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました。';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500 }
    );
  }
}
