import { NextRequest, NextResponse } from 'next/server';
import { isRpaTaimeeError, requireTaimeeRpaOperator } from '@/lib/rpa/taimee';

export const dynamic = 'force-dynamic';

// Chrome拡張が、資格のあるMyファミーユログイン状態を安全に確認するための軽量エンドポイント。
export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: 'Session check failed' }, { status: 500 });
  }
}
