// /api/cron/shift-record-check/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ✅ Vercel のスケジュール実行時だけ許可（ローカルは常に許可）
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const isLocalDev = process.env.NODE_ENV !== 'production';
  if (!isVercelCron && !isLocalDev) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ✅ origin を頑健に決定（未定義対策）
  const proto =
    req.headers.get('x-forwarded-proto') ??
    (isLocalDev ? 'http' : 'https');
  const hostHeader = req.headers.get('host');

  const origin =
    // 明示的に設定してあるなら最優先
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
    process.env.SITE_URL?.replace(/\/+$/, '') ||
    // Vercel環境なら VERCEL_URL を https で
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '')
      : undefined) ||
    // リクエストの Host ヘッダから推定（ローカル含む）
    (hostHeader ? `${proto}://${hostHeader}` : undefined);

  if (!origin) {
    return new Response('Server misconfigured: origin not resolvable', { status: 500 });
  }

  const url = `${origin}/api/cron/shift-record-check/runner`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invokedBy: 'cron' }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return new Response(`Upstream error: ${res.status}\n${text}`, { status: 500 });
  }

  return new Response(await res.text(), {
    status: 200,
    headers: {
      'content-type':
        res.headers.get('content-type') ?? 'text/plain; charset=utf-8',
    },
  });
}
