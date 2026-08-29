import { NextRequest, NextResponse } from 'next/server';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord, text } from '@/lib/rpa-runner/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    const runner = await authenticateRunner(request, body.runner_id);
    const runnerName = text(body.runner_name, 100);
    const status = body.status === 'online' || body.status === 'busy' ? body.status : null;
    const currentJobId = body.current_job_id === null ? null : text(body.current_job_id, 64);
    if (!runnerName || !status || (body.current_job_id !== null && !currentJobId)) {
      return NextResponse.json({ ok: false, error: 'Invalid heartbeat payload' }, { status: 400 });
    }

    const { error } = await (await import('@/lib/supabase/service')).supabaseAdmin
      .from('rpa_runners')
      .update({ runner_name: runnerName, last_heartbeat_at: new Date().toISOString(), last_status: status, current_job_id: currentJobId })
      .eq('runner_id', runner.runnerId);
    if (error) return NextResponse.json({ ok: false, error: 'Heartbeat could not be recorded' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
