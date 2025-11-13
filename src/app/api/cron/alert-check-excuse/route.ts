// /src/app/api/cron/alert-check-excuse/route.ts
// 3つのチェックを順番に実行するだけのハブ。
// - runPostalCodeCheck
// - runResignerShiftCheck
// - runShiftRecordUnfinishedCheck

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '../../alert_add/_shared';
import { runPostalCodeCheck } from '@/lib/alert_add/postal_code_check';
import { runResignerShiftCheck } from '@/lib/alert_add/resigner_shift_check';
import { runShiftRecordUnfinishedCheck } from '@/lib/alert_add/shift_record_unfinished_check';

type CheckResultOk<T> = { ok: true } & T;
type CheckResultErr = { ok: false; error: string };
type CheckResult<T> = CheckResultOk<T> | CheckResultErr;

type Body = {
  ok: boolean; // 全体として全部成功したら true, どれか失敗したら false
  postal_code: CheckResult<{ scanned: number; created: number }>;
  resigner_shift: CheckResult<{ scanned: number; created: number }>;
  shift_record_unfinished: CheckResult<{ scanned: number; created: number }>;
};

export async function GET(req: NextRequest) {
  const result: Body = {
    ok: true,
    postal_code: { ok: false, error: 'not executed' },
    resigner_shift: { ok: false, error: 'not executed' },
    shift_record_unfinished: { ok: false, error: 'not executed' },
  };

  try {
    // ★ ここでだけ cron 認証（CRON_SECRET 等）をチェック
    assertCronAuth(req);

    // 1) 郵便番号チェック
    try {
      const r = await runPostalCodeCheck();
      result.postal_code = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][postal_code_check] error', msg);
      result.postal_code = { ok: false, error: msg };
      result.ok = false;
    }

    // 2) 退職者シフト残り
    try {
      const r = await runResignerShiftCheck();
      result.resigner_shift = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][resigner_shift_check] error', msg);
      result.resigner_shift = { ok: false, error: msg };
      result.ok = false;
    }

    // 3) 実施記録 未提出
    try {
      const r = await runShiftRecordUnfinishedCheck();
      result.shift_record_unfinished = { ok: true, ...r };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cron][shift_record_unfinished_check] error', msg);
      result.shift_record_unfinished = { ok: false, error: msg };
      result.ok = false;
    }

    return NextResponse.json(result, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[cron][alert-check-excuse] fatal', msg);
    result.ok = false;
    // どこまで進んだかは result.* にそのまま残る
    return NextResponse.json(result, { status: 500 });
  }
}
