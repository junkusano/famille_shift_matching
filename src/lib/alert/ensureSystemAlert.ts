// src/lib/alert/ensureSystemAlert.ts
import { supabaseAdmin } from '@/lib/supabase/service';

export type VisibleRole = 'admin' | 'manager' | 'staff';

export type EnsureAlertParams = {
  message: string;
  severity?: 1 | 2 | 3;
  visible_roles?: VisibleRole[];
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
};

export type EnsureResult = { created: boolean; id: string | null };

export async function ensureSystemAlert(
  params: EnsureAlertParams,
): Promise<EnsureResult> {
  const {
    message,
    severity = 2,
    visible_roles = ['manager', 'staff'],
    kaipoke_cs_id = null,
    user_id = null,
    shift_id = null,
    rpa_request_id = null,
  } = params;

  console.log('[alert][ensure] try', {
    msg: message.slice(0, 60),
    kaipoke_cs_id,
    user_id,
    shift_id,
  });

  const { data: exists, error: selErr } = await supabaseAdmin
    .from('alert_log')
    .select('id, status')
    .in('status', ['open', 'in_progress', 'muted'])
    .eq('status_source', 'system')
    .eq('kaipoke_cs_id', kaipoke_cs_id)
    .eq('message', message)
    .limit(1);

  if (selErr) {
    console.error('[alert][ensure] select error', selErr);
    throw selErr;
  }

  if (exists?.length) {
    console.log('[alert][ensure] skip duplicate', { id: exists[0].id });
    return { created: false, id: exists[0].id as string };
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('alert_log')
    .insert({
      message,
      visible_roles,
      status: 'open',
      status_source: 'system',
      severity,
      kaipoke_cs_id,
      user_id,
      shift_id,
      rpa_request_id,
    })
    .select('id')
    .single();

  if (insErr) {
    console.error('[alert][ensure] insert error', insErr);
    throw insErr;
  }

  console.log('[alert][ensure] created', { id: inserted?.id });
  return { created: true, id: (inserted?.id as string) ?? null };
}
