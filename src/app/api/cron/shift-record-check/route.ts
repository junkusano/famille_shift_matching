//api/cron/shift-record-check/route.ts 

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_TIMEOUT_MS = 55_000; // Vercelの制限に合わせて余裕を持たせる

export async function GET(req: Request) {
  const url = new URL(req.url);

  // ?dry_run= の既定は 1（Dry Run）。本番実行したいときは ?dry_run=0 を付けて叩く
  const dryRun = url.searchParams.get('dry_run') ?? '0';

  // ローカルは http、デプロイは https を想定
  const host = req.headers.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';

  // 元のチェック用APIへ内部リクエスト
  const target = `${protocol}://${host}/api/shift-records/check?dry_run=${dryRun}`;

  // タイムアウト制御
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CRON_TIMEOUT_MS);

  try {
    console.info('--- Cron wrapper started ---', { target, dryRun });

    const res = await fetch(target, {
      method: 'GET',
      headers: {
        // 内部呼び出しの目印（必要なら元API側で参照）
        'x-cron-trigger': '1',
        // キャッシュしない
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      signal: ctrl.signal,
    });

    const text = await res.text();
    console.info('--- Cron wrapper finished ---', { status: res.status });

    // 元APIのステータスとContent-Typeをそのまま返す
    return new Response(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'text/plain; charset=utf-8',
      },
    });
  } catch (err) {
    console.error('Cron wrapper error', err?.message ?? err);
    const message =
      err?.name === 'AbortError'
        ? 'Cron wrapper: upstream timed out'
        : `Cron wrapper error: ${err?.message ?? String(err)}`;
    return new Response(message, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
