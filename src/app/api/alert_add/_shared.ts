// /src/app/api/alert_add/_shared.ts
import 'server-only';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

export type VisibleRole = 'admin' | 'manager' | 'staff';
export type AlertStatus = 'open' | 'in_progress' | 'done' | 'muted' | 'cancelled';
export const runtime = 'nodejs';

type EnsureAlertParams = {
  message: string;
  severity?: 1 | 2 | 3;
  visible_roles?: VisibleRole[];
  kaipoke_cs_id?: string | null;
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
};

function getServerCronSecret(): string | undefined {
  // どちらでもOK（Vercelは CRON_SECRET を使いがち）
  return process.env.ALERT_CRON_TOKEN || process.env.CRON_SECRET || undefined;
}

function extractToken(req: NextRequest): string | null {
  // 1) query ?token=xxx
  const q = req.nextUrl.searchParams.get('token');
  if (q) return q;

  // 2) header x-cron-token: xxx
  const h = req.headers.get('x-cron-token');
  if (h) return h;

  // 3) Authorization: Bearer xxx
  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

/** Cron 用の簡易認証 */
export function assertCronAuth(req: NextRequest) {
  // dev/previewでスキップしたい場合は環境変数で（任意）
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_ALERT_CRON_AUTH === '1') {
    return;
  }

  const serverSecret = getServerCronSecret();
  const clientToken = extractToken(req);
  if (!serverSecret || !clientToken || clientToken !== serverSecret) {
    throw new Error('Unauthorized');
  }
}

type EnsureResult = { created: boolean; id: string | null };

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

  const { data: exists, error: selErr } = await supabaseAdmin
    .from('alert_log')
    .select('id, status')
    .in('status', ['open', 'in_progress', 'muted'])
    .eq('status_source', 'system')
    .eq('kaipoke_cs_id', kaipoke_cs_id)
    .eq('message', message)
    .limit(1);

  if (selErr) throw selErr;
  if (exists && exists.length > 0) {
    return { created: false, id: exists[0].id as string };
    // NOTE: ここで “重複” と判定
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

  if (insErr) throw insErr;
  return { created: true, id: (inserted?.id as string) ?? null };
}
