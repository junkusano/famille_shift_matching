import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Definition = { id: string; name: string; job_type: string; timeout_ms?: number | null; schedule: { timezone?: unknown; times?: unknown }; payload: Record<string, unknown> };

function timeoutMsFor(definition: Definition): number | null {
  if (typeof definition.timeout_ms === 'number') return definition.timeout_ms;
  if (definition.job_type === 'taimee.daily_worker_follow_sms') return 600_000;
  return null;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

function jstMinute(now = new Date()): { key: string; scheduledFor: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const key = `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
  return { key, scheduledFor: new Date(now.getTime() - now.getSeconds() * 1000 - now.getMilliseconds()).toISOString() };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const now = jstMinute();
  // Some production environments predate the optional timeout_ms column.
  // Selecting all columns keeps scheduling operational during that schema rollout.
  const { data, error } = await supabaseAdmin.from('rpa_job_definitions').select('*').eq('is_enabled', true).eq('trigger_type', 'schedule').eq('execution_mode', 'famille_rpa');
  if (error) {
    console.error('[rpa-scheduler] Job definitions could not be loaded', { code: error.code, message: error.message });
    return NextResponse.json({ ok: false, error: 'Job definitions could not be loaded' }, { status: 500 });
  }
  const results: Array<{ definition_id: string; status: 'created' | 'duplicate' | 'skipped' }> = [];
  for (const definition of (data ?? []) as Definition[]) {
    const times = Array.isArray(definition.schedule?.times) ? definition.schedule.times.filter((time): time is string => typeof time === 'string') : [];
    const jstTime = now.key.slice(-5);
    if (definition.schedule?.timezone !== 'Asia/Tokyo' || !times.includes(jstTime)) { results.push({ definition_id: definition.id, status: 'skipped' }); continue; }
    const { error: insertError } = await supabaseAdmin.from('rpa_runner_jobs').insert({ job_type: definition.job_type, payload: definition.payload, timeout_ms: timeoutMsFor(definition), status: 'pending', job_definition_id: definition.id, scheduled_for: now.scheduledFor });
    if (insertError?.code === '23505') { results.push({ definition_id: definition.id, status: 'duplicate' }); continue; }
    if (insertError) {
      console.error('[rpa-scheduler] Scheduled job could not be created', { definitionId: definition.id, code: insertError.code, message: insertError.message });
      return NextResponse.json({ ok: false, error: 'Scheduled job could not be created', results }, { status: 500 });
    }
    await supabaseAdmin.from('rpa_job_definitions').update({ last_generated_at: new Date().toISOString() }).eq('id', definition.id);
    results.push({ definition_id: definition.id, status: 'created' });
  }
  return NextResponse.json({ ok: true, jst_minute: now.key, results });
}
