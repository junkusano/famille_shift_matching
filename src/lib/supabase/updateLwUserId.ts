import { supabaseAdmin } from '@/lib/supabase/service'; // ✅ サーバー用クライアントに変更

export async function updateLwUserIdMapping(
  userId: string,
  lwUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!userId || !lwUserId) {
      throw new Error('userId または lwUserId が未指定です');
    }

    console.log('[updateLwUserIdMapping] 実行: userId =', userId, 'lwUserId =', lwUserId);

    const { error } = await supabaseAdmin
      .from('users')
      .update({ lw_userid: lwUserId })
      .eq('user_id', userId);

    if (error) {
      console.error('[updateLwUserIdMapping] 更新失敗:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[updateLwUserIdMapping] 成功: user_id=${userId}, lw_userid=${lwUserId}`);
    return { success: true };
  } catch (err) {
    console.error('[updateLwUserIdMapping] 例外エラー:', err);
    return { success: false, error: err instanceof Error ? err.message : '不明なエラー' };
  }
}
