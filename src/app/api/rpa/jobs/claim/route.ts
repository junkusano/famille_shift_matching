import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord } from '@/lib/rpa-runner/validation';

export const dynamic = 'force-dynamic';

type ClaimedJob = { id: string; job_type: string; payload: Record<string, unknown>; timeout_ms: number | null };

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    const runner = await authenticateRunner(request, body.runner_id);
    const { data, error } = await supabaseAdmin.rpc('claim_rpa_runner_job', { p_runner_id: runner.runnerId });
    if (error) return NextResponse.json({ ok: false, error: 'Job claim failed' }, { status: 500 });
    const job = Array.isArray(data) ? data[0] as ClaimedJob | undefined : undefined;
    return NextResponse.json({ ok: true, job: job ? { id: job.id, job_type: job.job_type, payload: job.payload, ...(job.timeout_ms === null ? {} : { timeout_ms: job.timeout_ms }) } : null });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
