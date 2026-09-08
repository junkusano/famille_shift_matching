import { providerSyncEnabled, validateSharefullSyncJob } from '@/lib/spot-sync/reconcile';
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
