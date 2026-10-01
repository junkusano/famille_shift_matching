import { providerSyncEnabled, validateSharefullSyncJob } from '@/lib/spot-sync/reconcile';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord } from '@/lib/rpa-runner/validation';
import { sharefullRpaMode } from '@/lib/spot-sync/sharefullScope';

export const dynamic = 'force-dynamic';

type ClaimedJob = { id: string; job_type: string; payload: Record<string, unknown>; timeout_ms: number | null };

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    const runner = await authenticateRunner(request, body.runner_id, body.runner_environment);
    const { data, error } = await supabaseAdmin.rpc('claim_rpa_runner_job', { p_runner_id: runner.runnerId, p_runner_environment: runner.environment });
    if (error) return NextResponse.json({ ok: false, error: 'Job claim failed' }, { status: 500 });
    const job = Array.isArray(data) ? data[0] as ClaimedJob | undefined : undefined;
    if (job?.job_type === 'sharefull.check_decision_status'
      && (process.env.SHAREFULL_DECISION_MONITOR_ENABLED?.trim().toLowerCase() !== 'true'
        || runner.environment !== sharefullRpaMode()
        || !isRecord(job.payload)
        || job.payload.environment !== sharefullRpaMode()
        || !process.env.SHAREFULL_DECISION_RUNNER_ID?.trim()
        || runner.runnerId !== process.env.SHAREFULL_DECISION_RUNNER_ID.trim())) {
      const { error: releaseError } = await supabaseAdmin.from('rpa_runner_jobs')
        .update({ status: 'pending', claimed_runner_id: null, claimed_at: null })
        .eq('id', job.id).eq('status', 'claimed').eq('claimed_runner_id', runner.runnerId);
      if (releaseError) throw releaseError;
      return NextResponse.json({ ok: false, error: 'Dedicated decision runner is not configured for this environment' }, { status: 503 });
    }
    if (job && providerSyncEnabled() && ['sharefull.create_spot_offer','sharefull.close_spot_offer'].includes(job.job_type)) {
      let valid: boolean;
      try {
        valid = await validateSharefullSyncJob(job.job_type, job.payload);
      } catch {
        // No browser action has been dispatched. Release the claim for a later retry.
        const { error: releaseError } = await supabaseAdmin.from('rpa_runner_jobs')
          .update({status:'pending',claimed_runner_id:null,claimed_at:null})
          .eq('id',job.id).eq('status','claimed').eq('claimed_runner_id',runner.runnerId);
        return NextResponse.json({ok:false,error:releaseError ? 'Job release failed' : 'Recruitment validation unavailable'}, {status:503});
      }
      if (!valid) {
        const {error: cancelError} = await supabaseAdmin.from('rpa_runner_jobs').update({status:'cancelled',result:{reason:'募集条件が変更されたため実行中止'}}).eq('id',job.id).eq('status','claimed').eq('claimed_runner_id',runner.runnerId);
        if (cancelError) throw cancelError;
        return NextResponse.json({ok:true,job:null});
      }
    }
    return NextResponse.json({ ok: true, job: job ? { id: job.id, job_type: job.job_type, payload: job.payload, ...(job.timeout_ms === null ? {} : { timeout_ms: job.timeout_ms }) } : null });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
