// /src/app/api/alert_add/_shared.ts
import 'server-only';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service'; // ← エイリアス無ければ相対に

export type VisibleRole = 'admin' | 'manager' | 'staff';
export type AlertStatus = 'open' | 'in_progress' | 'done' | 'muted' | 'cancelled';

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

function getServerCronSecret(): string | undefined {
  return process.env.ALERT_CRON_TOKEN || process.env.CRON_SECRET || undefined;
}

function extractToken(req: NextRequest): string | null {
  const q = req.nextUrl.searchParams.get('token');
  if (q) return q;
  const h = req.headers.get('x-cron-token');
  if (h) return h;
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return null;
}

export function assertCronAuth(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_ALERT_CRON_AUTH === '1') return;
  const serverSecret = getServerCronSecret();
  const clientToken = extractToken(req);
  if (!serverSecret || !clientToken || clientToken !== serverSecret) {
    console.warn('[cron][auth] unauthorized', { hasServerSecret: !!serverSecret, path: req.nextUrl.pathname });
    throw new Error('Unauthorized');
  }
}

export async function ensureSystemAlert(params: EnsureAlertParams): Promise<EnsureResult> {
  const {
    message,
    severity = 2,
    visible_roles = ['manager', 'staff'],
    kaipoke_cs_id = null,
    user_id = null,
    shift_id = null,
    rpa_request_id = null,
  } = params;

  console.log('[alert][ensure] try', { msg: message.slice(0, 60), kaipoke_cs_id, user_id, shift_id });

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
