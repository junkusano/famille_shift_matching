// src/lib/cron/auth.ts
import { NextRequest } from 'next/server';

export type VisibleRole = 'admin' | 'manager' | 'staff';

export function getServerCronSecret(): string | undefined {
  return process.env.CRON_SECRET || undefined;
}

export function getIncomingCronToken(
  req: NextRequest,
): { token: string | null; src: 'query' | 'header' | 'auth' | 'none' } {
  const q = req.nextUrl.searchParams.get('token');
  if (q) return { token: q, src: 'query' };

  const h = req.headers.get('x-cron-token');
  if (h) return { token: h, src: 'header' };

  const auth = req.headers.get('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return { token: auth.slice(7).trim(), src: 'auth' };
  }

  return { token: null, src: 'none' };
}

export function assertCronAuth(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production' && process.env.SKIP_ALERT_CRON_AUTH === '1') return;

  const serverSecret = getServerCronSecret();
  const { token, src } = getIncomingCronToken(req);

  const mask = (s?: string | null) =>
    s ? `${s.slice(0, 2)}...(${s.length})` : 'null';

  console.log('[cron][auth]', {
    path: req.nextUrl.pathname,
    src,
    hasServerSecret: !!serverSecret,
    serverSecretLen: serverSecret?.length ?? 0,
    tokenPreview: mask(token),
  });

  if (!serverSecret || !token || token !== serverSecret) {
    console.warn('[cron][auth] unauthorized', {
      path: req.nextUrl.pathname,
      reason: !serverSecret ? 'no_server_secret' : !token ? 'no_token' : 'mismatch',
    });
    throw new Error('Unauthorized');
  }
}
