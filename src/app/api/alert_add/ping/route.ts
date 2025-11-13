//api/alert_add/ping/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import {
  getIncomingCronToken,
  getServerCronSecret,
} from '../_shared';

export async function GET(req: NextRequest) {
  const { token, src } = getIncomingCronToken(req);
  const serverSecret = getServerCronSecret();

  // 生のヘッダの一部も確認
  const auth = req.headers.get('authorization') || null;
  const xhdr = req.headers.get('x-cron-token') || null;

  const diag = {
    path: req.nextUrl.pathname,
    src,               // token をどこで拾えたか: 'auth' | 'header' | 'query' | 'none'
    hasToken: !!token,
    hasAuthHeader: !!auth,
    hasXHeader: !!xhdr,
    hasServerSecret: !!serverSecret,
    tokenLen: token?.length ?? 0,
    serverSecretLen: serverSecret?.length ?? 0,
    // middleware経由で止まってないかの簡易確認
    runtime: runtime,
  };

  console.log('[ping][diag]', diag);
  return NextResponse.json({ ok: true, diag }, { status: 200 });
}
