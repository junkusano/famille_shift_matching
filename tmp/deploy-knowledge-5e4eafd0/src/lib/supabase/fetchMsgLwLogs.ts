// src/lib/supabase/fetchMsgLwLogs.ts

import { supabaseAdmin } from './service';
import { MsgLwLog } from '@/types/msgLwLog';

/**
 * 未判定ステータスのメッセージログを取得する関数
 */
export const fetchMsgLwLogs = async (): Promise<MsgLwLog[]> => {
  const { data, error } = await supabaseAdmin
    .from('msg_lw_log')
    .select('*')
    .eq('status', '0_未判定');

  if (error) {
    console.error('msg_lw_log の取得に失敗しました:', error);
    throw error;
  }

  return (data ?? []) as MsgLwLog[];
};
