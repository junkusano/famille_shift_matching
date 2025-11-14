// src/lib/alert/ensureSystemAlert.ts

import { supabaseAdmin } from '@/lib/supabase/service';

export type EnsureSystemAlertArgs = {
  message: string;
  severity?: number;
  visible_roles?: string[];
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  status_source?: string; // 必要なら
};

export type EnsureSystemAlertResult = {
  created: boolean;
  id?: string;
};

export async function ensureSystemAlert(
  args: EnsureSystemAlertArgs,
): Promise<EnsureSystemAlertResult> {
  const {
    message,
    severity = 2,
    visible_roles = ['admin', 'manager', 'member'],
    kaipoke_cs_id = null,
    user_id = null,
    shift_id = null,
    status_source = 'system',
  } = args;

  // ★ ここは _shared.ts にあったロジックをコピペしてください
  //   例）同じ message / kaipoke_cs_id / shift_id の open アラートがあれば再利用、なければ insert

  const { data: existed, error: selectError } = await supabaseAdmin
    .from('alert_log')
    .select('id')
    .eq('message', message)
    .eq('kaipoke_cs_id', kaipoke_cs_id)
    .eq('shift_id', shift_id)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error('[alert][ensure] select error', selectError);
    throw selectError;
  }

  if (existed?.id) {
    return { created: false, id: existed.id };
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('alert_log')
    .insert({
      message,
      visible_roles,
      severity,
      kaipoke_cs_id,
      user_id,
      shift_id,
      status: 'open',
      status_source,
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('[alert][ensure] insert error', insertError);
    throw insertError;
  }

  console.info('[alert][ensure] created', {
    msg: message,
    kaipoke_cs_id,
    user_id,
    shift_id,
  });

  return { created: true, id: inserted.id };
}
