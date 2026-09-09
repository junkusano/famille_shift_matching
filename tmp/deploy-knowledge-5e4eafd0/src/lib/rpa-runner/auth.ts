import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

export type AuthenticatedRunner = { runnerId: string; runnerName: string };

export class RpaRunnerAuthError extends Error {
  constructor(message = 'Unauthorized') { super(message); this.name = 'RpaRunnerAuthError'; }
}

export function hashRunnerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isRunnerId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{3,80}$/.test(value);
}

export async function authenticateRunner(request: NextRequest, runnerId: unknown): Promise<AuthenticatedRunner> {
  if (!isRunnerId(runnerId)) throw new RpaRunnerAuthError();
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const headerRunnerId = request.headers.get('x-rpa-runner-id');
  if (!bearer || (headerRunnerId !== null && headerRunnerId !== runnerId)) throw new RpaRunnerAuthError();

  const { data, error } = await supabaseAdmin
    .from('rpa_runners')
    .select('runner_id, runner_name, token_hash')
    .eq('runner_id', runnerId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) throw new RpaRunnerAuthError();

  const expected = Buffer.from(data.token_hash, 'hex');
  const actual = Buffer.from(hashRunnerToken(bearer), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new RpaRunnerAuthError();
  return { runnerId: data.runner_id, runnerName: data.runner_name };
}
