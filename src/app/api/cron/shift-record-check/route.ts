// src/app/api/cron/shift-record-check/route.ts

import { NextRequest, NextResponse } from 'next/server';
// ★ alert-check-excuse と同じ import パスにすること！（ここ重要）
import { assertCronAuth } from '@/lib/cron/auth';
import { runShiftRecordCheck } from '@/lib/shift/shift_record_check';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // ① ここでだけ認証する（alert-check-excuse と同じ）
  assertCronAuth(req);

  // ② 実処理（lib 直呼び）
  const result = await runShiftRecordCheck({ dryRun: true });

  return NextResponse.json({
    ok: true,
    source: 'cron/shift-record-check',
    ...result,
  });
}
