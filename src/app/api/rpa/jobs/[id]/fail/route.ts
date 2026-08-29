import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord, redactDebug, text } from '@/lib/rpa-runner/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    if (!UUID.test(id) || !isRecord(body)) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    const errorCode = text(body.error_code, 100);
    const errorType = text(body.error_type, 100);
    const errorMessage = text(body.error_message, 2000);
    if (!errorCode || !errorType || !errorMessage) return NextResponse.json({ ok: false, error: 'Invalid failure payload' }, { status: 400 });
    const runner = await authenticateRunner(request, body.runner_id);
    const { data, error } = await supabaseAdmin
      .from('rpa_runner_jobs')
      .update({ status: 'failed', error_code: errorCode, error_type: errorType, error_message: errorMessage, error_debug: redactDebug(body.debug ?? {}), completed_at: new Date().toISOString() })
      .eq('id', id).eq('claimed_runner_id', runner.runnerId).eq('status', 'claimed')
      .select('id').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: 'Job failure could not be recorded' }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'Job is not claimable by this runner' }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
