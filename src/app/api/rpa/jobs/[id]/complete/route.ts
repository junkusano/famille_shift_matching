import { providerSyncEnabled } from '@/lib/spot-sync/reconcile';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { authenticateRunner, RpaRunnerAuthError } from '@/lib/rpa-runner/auth';
import { isRecord } from '@/lib/rpa-runner/validation';
import { resolveRpaFailureAlerts } from '@/lib/rpa-runner/alerts';
import { sharefullRequestTableName, sharefullRpaMode } from '@/lib/spot-sync/sharefullScope';
import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();
    if (!UUID.test(id) || !isRecord(body) || !isRecord(body.result)) return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
      const runner = await authenticateRunner(request, body.runner_id, body.runner_environment);
    const { data: claimedJob, error: claimedLookupError } = await supabaseAdmin.from('rpa_runner_jobs')
      .select('job_type, payload, status, claimed_runner_id')
      .eq('id', id).eq('claimed_runner_id', runner.runnerId).maybeSingle();
    if (claimedLookupError) throw claimedLookupError;
    if (claimedJob?.job_type === 'sharefull.check_decision_status') {
      if (!process.env.SHAREFULL_DECISION_RUNNER_ID?.trim()
        || runner.runnerId !== process.env.SHAREFULL_DECISION_RUNNER_ID.trim()
        || runner.environment !== 'production') {
        return NextResponse.json({ ok: false, error: 'Dedicated decision runner required' }, { status: 403 });
      }
      if (claimedJob.status !== 'claimed' || !isRecord(claimedJob.payload)) {
        return NextResponse.json({ ok: false, error: 'Decision job is not claimed' }, { status: 409 });
      }
      const targets = claimedJob.payload.targets;
      const submitted = body.result.observations;
      if (!Array.isArray(targets) || !Array.isArray(submitted) || targets.length < 1 || targets.length > 30 || submitted.length !== targets.length) {
        return NextResponse.json({ ok: false, error: 'Invalid decision observations' }, { status: 400 });
      }
      const sanitized = [];
      const seen = new Set<string>();
      for (const item of submitted) {
        if (!isRecord(item) || typeof item.sharefull_order_id !== 'string' || typeof item.sharefull_job_id !== 'string'
          || !['decided', 'undecided', 'unknown'].includes(String(item.decision_state))) {
          return NextResponse.json({ ok: false, error: 'Invalid decision observation' }, { status: 400 });
        }
        const target = targets.find((value) => isRecord(value)
          && value.sharefull_order_id === item.sharefull_order_id
          && value.sharefull_job_id === item.sharefull_job_id);
        if (!target || seen.has(item.sharefull_job_id)) return NextResponse.json({ ok: false, error: 'Decision target mismatch' }, { status: 409 });
        seen.add(item.sharefull_job_id);
        sanitized.push({
          sharefull_order_id: item.sharefull_order_id,
          sharefull_job_id: item.sharefull_job_id,
          decision_state: item.decision_state,
        });
      }
      const { data: pendingNotifications, error: decisionCompleteError } = await supabaseAdmin.rpc(
        'complete_sharefull_decision_check',
        { p_job_id: id, p_runner_id: runner.runnerId, p_result: { observations: sanitized } },
      );
      if (decisionCompleteError) {
        console.error('[rpa/jobs/complete] decision result rejected', { code: decisionCompleteError.code });
        return NextResponse.json({ ok: false, error: 'Decision completion failed' }, { status: 500 });
      }

      const notificationTargets = Array.isArray(pendingNotifications)
        ? pendingNotifications.filter((value): value is { request_id: string; sharefull_job_id: string } =>
          isRecord(value) && typeof value.request_id === 'string' && UUID.test(value.request_id)
          && typeof value.sharefull_job_id === 'string' && /^[1-9]\d*$/.test(value.sharefull_job_id))
        : [];
      const channelId = process.env.SHAREFULL_DECISION_CHANNEL_ID?.trim();
      let notified = 0;
      if (channelId && notificationTargets.length) {
        try {
          const jobIds = notificationTargets.map((target) => target.sharefull_job_id);
          await sendLWBotMessage(channelId, [
            'Sharefullで応募決定を検出しました。',
            `求人ID: ${jobIds.join(', ')}`,
            '応募者の個人情報は取得・通知していません。',
          ].join('\n'),
            await getAccessToken());
          const { error: notifiedError } = await supabaseAdmin.from('sharefull_decision_status' as never)
            .update({ lineworks_notified_at: new Date().toISOString() })
            .in('request_id', notificationTargets.map((target) => target.request_id)).is('lineworks_notified_at', null);
          if (notifiedError) throw notifiedError;
          notified = notificationTargets.length;
        } catch {
          // A later monitoring pass may reclaim the notification after the SQL lease expires.
          console.error('[rpa/jobs/complete] Sharefull decision notification failed');
        }
      }
      return NextResponse.json({ ok: true, decision_notifications: notified });
    }
    if (providerSyncEnabled() && sharefullRpaMode() !== 'test') {
      const {data: job,error: lookupError} = await supabaseAdmin.from('rpa_runner_jobs').select('job_type').eq('id',id).eq('claimed_runner_id',runner.runnerId).maybeSingle();
      if (lookupError) throw lookupError;
      if (job?.job_type.startsWith('sharefull.')) {
        const {data: completed,error: completeError} = await supabaseAdmin.rpc('complete_sharefull_sync_job',{p_job_id:id,p_runner_id:runner.runnerId,p_result:body.result});
        if (completeError) return NextResponse.json({ok:false,error:'Sharefull completion failed'},{status:500});
        return NextResponse.json({ok:completed===true},{status:completed?200:409});
      }
    }
    if (sharefullRpaMode() === 'test') {
      const { data: claimedJob, error: claimedJobError } = await supabaseAdmin
        .from('rpa_runner_jobs')
        .select('job_type, payload')
        .eq('id', id)
        .eq('claimed_runner_id', runner.runnerId)
        .eq('status', 'claimed')
        .maybeSingle();
      if (claimedJobError) throw claimedJobError;
      if (claimedJob?.job_type === 'sharefull.close_spot_offer') {
        const payload = isRecord(claimedJob.payload) ? claimedJob.payload : {};
        const result = isRecord(body.result) ? body.result : {};
        const requestId = typeof payload.spot_offer_request_id === 'string' ? payload.spot_offer_request_id.trim() : '';
        const expectedJobId = typeof payload.sharefull_job_id === 'string' ? payload.sharefull_job_id.trim() : '';
        const expectedOrderId = typeof payload.sharefull_order_id === 'string' ? payload.sharefull_order_id.trim() : '';
        const actualJobId = typeof result.sharefull_job_id === 'string' ? result.sharefull_job_id.trim() : '';
        const actualOrderId = typeof result.sharefull_order_id === 'string' ? result.sharefull_order_id.trim() : '';
        if (result.closed !== true || !requestId || actualJobId !== expectedJobId || actualOrderId !== expectedOrderId) {
          return NextResponse.json({ ok: false, error: 'Sharefull終了結果のID照合に失敗しました' }, { status: 409 });
        }
        const { data: closedRequest, error: closeUpdateError } = await supabaseAdmin
          .from(sharefullRequestTableName() as never)
          .update({ sharefull_status: 'closed', sharefull_sync_error: null })
          .eq('id', requestId)
          .eq('sharefull_job_id', actualJobId)
          .eq('sharefull_order_id', actualOrderId)
          .select('id')
          .maybeSingle();
        if (closeUpdateError) return NextResponse.json({ ok: false, error: 'Sharefull終了状態の保存に失敗しました' }, { status: 500 });
        if (!closedRequest) return NextResponse.json({ ok: false, error: 'Sharefull対象案件のID照合に失敗しました' }, { status: 409 });
      }
    }
    const { data, error } = await supabaseAdmin
      .from('rpa_runner_jobs')
      .update({ status: 'completed', result: body.result, completed_at: new Date().toISOString() })
      .eq('id', id).eq('claimed_runner_id', runner.runnerId).eq('status', 'claimed')
      .select('id, job_type, payload').maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: 'Job completion failed' }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: 'Job is not claimable by this runner' }, { status: 409 });
    if (data.job_type === 'sharefull.create_spot_offer') {
      const payload = isRecord(data.payload) ? data.payload : {};
      const result = isRecord(body.result) ? body.result : {};
      const requestId = typeof payload.spot_offer_request_id === 'string' ? payload.spot_offer_request_id.trim() : '';
      const sharefullJobId = typeof result.sharefull_job_id === 'string' ? result.sharefull_job_id.trim() : '';
      const sharefullOrderId = typeof result.sharefull_order_id === 'string' ? result.sharefull_order_id.trim() : '';
      if (requestId && sharefullJobId) {
        const { error: sharefullUpdateError } = await supabaseAdmin
          .from(sharefullRequestTableName() as never)
          .update({
            sharefull_job_id: sharefullJobId,
            sharefull_order_id: sharefullOrderId || null,
            sharefull_status: 'published',
            sharefull_sync_error: sharefullOrderId ? null : 'URL管理番号が未取得です',
          })
          .eq('id', requestId)
          .is('sharefull_job_id', null);
        if (sharefullUpdateError) return NextResponse.json({ ok: false, error: 'Sharefull案件IDの保存に失敗しました' }, { status: 500 });
      }
    }
    await resolveRpaFailureAlerts(runner.runnerId, data.job_type);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RpaRunnerAuthError) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }
}
