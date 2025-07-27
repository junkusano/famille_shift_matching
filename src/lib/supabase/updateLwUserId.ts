import { supabase } from '@/lib/supabaseClient';

export async function updateLwUserIdMapping(userId: string, lwUserId: string): Promise<{ success: boolean; error?: string }> {

  try {
    if (!userId || !lwUserId) {
      throw new Error('userId または lwUserId が未指定です');
    }

    console.log('[updatelwuserId] lwUserId (UUID):', lwUserId, 'user_id:', userId);

    const { error } = await supabase
      .from('users')
      .update({ lw_userid: lwUserId })
      .eq('user_id', userId);

    if (error) {
      console.error('[updateLwUserIdMapping] 更新失敗:', error.message);
      return { success: false, error: error.message };
    }

    console.log(`[updateLwUserIdMapping] user_id: ${userId} に lw_userid: ${lwUserId} を更新しました`);
    return { success: true };
  } catch (err) {
    console.error('[updateLwUserIdMapping] 例外エラー:', err);
    return { success: false, error: err instanceof Error ? err.message : '不明なエラー' };
  }
}
