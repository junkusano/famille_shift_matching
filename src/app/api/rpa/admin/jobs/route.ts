import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { isRunnerId } from '@/lib/rpa-runner/auth';
import { isRecord, positiveInteger, text } from '@/lib/rpa-runner/validation';
import { isRpaTaimeeError, requireTaimeeRpaOperator } from '@/lib/rpa/taimee';

const JOB_TYPE = /^[a-z][a-z0-9._-]{0,100}$/;
function adminError(error: unknown) {
  if (isRpaTaimeeError(error)) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  return NextResponse.json({ ok: false, error: 'ジョブの処理に失敗しました。' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const { data, error } = await supabaseAdmin.from('rpa_runner_jobs')
      .select('id, job_type, payload, timeout_ms, status, target_runner_id, claimed_runner_id, claimed_at, completed_at, result, error_code, error_type, error_message, created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ ok: true, jobs: data ?? [] });
  } catch (error) { return adminError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body: unknown = await request.json();
    if (!isRecord(body) || typeof body.job_type !== 'string' || !JOB_TYPE.test(body.job_type) || !isRecord(body.payload)) {
      return NextResponse.json({ ok: false, error: 'ジョブタイプまたはpayloadが不正です。' }, { status: 400 });
    }
    const targetRunnerId = body.target_runner_id === null || body.target_runner_id === undefined ? null : body.target_runner_id;
    if (targetRunnerId !== null && !isRunnerId(targetRunnerId)) return NextResponse.json({ ok: false, error: '対象Runner IDが不正です。' }, { status: 400 });
    const timeoutMs = body.timeout_ms === undefined || body.timeout_ms === null ? null : positiveInteger(body.timeout_ms, 86_400_000);
    if (body.timeout_ms !== undefined && body.timeout_ms !== null && timeoutMs === null) return NextResponse.json({ ok: false, error: 'timeout_msが不正です。' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('rpa_runner_jobs')
      .insert({ job_type: body.job_type, payload: body.payload, timeout_ms: timeoutMs, target_runner_id: targetRunnerId })
      .select('id, job_type, payload, timeout_ms, status, target_runner_id, created_at').single();
    if (error) return NextResponse.json({ ok: false, error: error.code === '23503' ? '対象Runnerが見つかりません。' : 'ジョブを作成できませんでした。' }, { status: error.code === '23503' ? 400 : 500 });
    return NextResponse.json({ ok: true, job: data }, { status: 201 });
  } catch (error) { return adminError(error); }
}
