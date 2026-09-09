// src/app/api/cron/shift-record-check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { runShiftRecordCheck } from '@/lib/shift/shift_record_check';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);

    const result = await runShiftRecordCheck({ dryRun: false });

    return NextResponse.json({
      ok: true,
      source: 'cron/shift-record-check',
      ...result,
    });
  } catch (e) {
    console.error('[cron][shift-record-check] fatal unauthorized_cron', e);
    return NextResponse.json(
      { ok: false, error: 'unauthorized_cron' },
      { status: 401 },
    );
  }
}
