import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord, redactDebug, text } from '@/lib/rpa-runner/validation';
import { notifyRpaJobFailure, rpaErrorFingerprint, sanitizeRpaAlertText } from '@/lib/rpa-runner/alerts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    if (!UUID.test(id) || !isRecord(body)) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    const errorCode = text(body.error_code, 100);
    const errorType = text(body.error_type, 100);
    const errorMessage = text(body.error_message, 2000);
    const errorCategory = text(body.error_category, 100) ?? errorType;
    const retryCount = typeof body.retry_count === 'number' && Number.isSafeInteger(body.retry_count) && body.retry_count >= 0 && body.retry_count <= 100 ? body.retry_count : 0;
    if (!errorCode || !errorType || !errorMessage || !errorCategory) return NextResponse.json({ ok: false, error: 'Invalid failure payload' }, { status: 400 });
    const runner = await authenticateRunner(request, body.runner_id);
    const safeMessage = sanitizeRpaAlertText(errorMessage);
    const { data, error } = await supabaseAdmin
      .from('rpa_runner_jobs')
      .update({ status: 'failed', error_code: errorCode, error_type: errorType, error_category: errorCategory, error_message: safeMessage, error_debug: redactDebug(body.debug ?? {}), retry_count: retryCount, failed_at: new Date().toISOString(), completed_at: new Date().toISOString() })
      .eq('id', id).eq('claimed_runner_id', runner.runnerId).eq('status', 'claimed')
      .select('id, job_type').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: 'Job failure could not be recorded' }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'Job is not claimable by this runner' }, { status: 409 });
    const fingerprint = rpaErrorFingerprint({ runnerId: runner.runnerId, jobType: data.job_type, errorCategory, errorCode });
    await supabaseAdmin.from('rpa_runner_jobs').update({ error_fingerprint: fingerprint }).eq('id', id);
    await notifyRpaJobFailure({ jobId: id, runnerId: runner.runnerId, runnerName: runner.runnerName, jobType: data.job_type, errorCode, errorCategory, errorMessage: safeMessage, retryCount });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
