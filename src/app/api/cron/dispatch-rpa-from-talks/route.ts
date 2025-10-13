// /src/app/api/cron/dispatch-rpa-from-talks/route.ts
import { NextResponse } from 'next/server';
import analyzePendingTalksAndDispatch from '@/lib/supabase/analyzeTalksAndDispatchToRPA';

export async function GET() {
  const startedAt = new Date().toISOString();
  try {
    console.info('[CRON] dispatch-rpa-from-talks start', { startedAt });

    // 余計な時間窓クエリはやめて、解析関数に任せる
    await analyzePendingTalksAndDispatch();

    const endedAt = new Date().toISOString();
    console.info('[CRON] dispatch-rpa-from-talks done', { startedAt, endedAt });
    return NextResponse.json({ ok: true, startedAt, endedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[CRON] dispatch-rpa-from-talks error', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
