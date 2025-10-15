// /api/cron/shift-record-check/route.ts
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ✅ Vercel のスケジュール実行時に付くヘッダを許可（他は拒否）
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  // ローカル開発は通す（本番のみ制限）
  const isLocalDev = process.env.NODE_ENV !== 'production';

  if (!isVercelCron && !isLocalDev) {
    // ここだけ 401 にすることで「手動アクセス」を遮断（他cronと同じなら無認証でもOK）
    return new Response('Unauthorized', { status: 401 });
  }

  // 以降は元の本処理
  const res = await fetch(new URL('/api/shift-records/check', req.url), {
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
    headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain; charset=utf-8' },
  });
}