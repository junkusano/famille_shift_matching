import { supabaseAdmin } from '@/lib/supabase/service';

export async function updateLwUserIdMapping(userId: string, lwUserId: string): Promise<{ success: boolean; error?: string }> {
  //alert('[updateLwUserIdMapping] 開始');

  try {
    if (!userId || !lwUserId) {
      //alert('[updateLwUserIdMapping] userId または lwUserId が未指定です');
      throw new Error('userId または lwUserId が未指定です');
    }

    //alert(`[updateLwUserIdMapping] 実行: userId=${userId}, lwUserId=${lwUserId}`);

    console.log('[updateLwUserIdMapping] 実行前:', { userId, lwUserId });
    const { error } = await supabaseAdmin
      .from('users')
      .update({ lw_userid: lwUserId })
      .eq('user_id', userId);

    //alert('[updateLwUserIdMapping] update 実行完了');

    if (error) {
      console.error('[updateLwUserIdMapping] 更新失敗:', error.message);
      //alert(`[updateLwUserIdMapping] 更新失敗: ${error.message}`);
      return { success: false, error: error.message };
    }

    console.log(`[updateLwUserIdMapping] 成功: user_id=${userId}, lw_userid=${lwUserId}`);
    //alert(`[updateLwUserIdMapping] 成功: user_id=${userId}, lw_userid=${lwUserId}`);

    return { success: true };
  } catch (err) {
    console.error('[updateLwUserIdMapping] 例外エラー:', err);
    //alert(`[updateLwUserIdMapping] 例外エラー: ${err instanceof Error ? err.message : '不明なエラー'}`);
    return { success: false, error: err instanceof Error ? err.message : '不明なエラー' };
  }
}
