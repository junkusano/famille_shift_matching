import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { hashRunnerToken, isRunnerId } from '@/lib/rpa-runner/auth';
import { isRecord, text } from '@/lib/rpa-runner/validation';
import { isRpaTaimeeError, requireTaimeeRpaOperator } from '@/lib/rpa/taimee';

function safeRunner(row: Record<string, unknown>) {
  return {
    runner_id: row.runner_id, runner_name: row.runner_name, is_active: row.is_active,
    last_heartbeat_at: row.last_heartbeat_at, last_status: row.last_status,
    current_job_id: row.current_job_id, created_at: row.created_at, updated_at: row.updated_at,
  };
}

function adminError(error: unknown) {
  if (isRpaTaimeeError(error)) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  return NextResponse.json({ ok: false, error: 'Runner設定の処理に失敗しました。' }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const { data, error } = await supabaseAdmin.from('rpa_runners').select('runner_id, runner_name, is_active, last_heartbeat_at, last_status, current_job_id, created_at, updated_at').order('runner_id');
    if (error) throw error;
    return NextResponse.json({ ok: true, runners: data ?? [] });
  } catch (error) { return adminError(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body: unknown = await request.json();
    if (!isRecord(body) || !isRunnerId(body.runner_id)) return NextResponse.json({ ok: false, error: 'Runner IDは英数字・ハイフン・アンダースコアで3〜80文字にしてください。' }, { status: 400 });
    const runnerName = text(body.runner_name, 100);
    if (!runnerName) return NextResponse.json({ ok: false, error: '表示名はtrim後1〜100文字で入力してください。' }, { status: 400 });
    if (typeof body.token !== 'string') return NextResponse.json({ ok: false, error: 'Runnerトークンが送信されていません。' }, { status: 400 });
    const token = text(body.token, 500);
    if (!token) return NextResponse.json({ ok: false, error: 'Runnerトークンはtrim後1〜500文字で入力してください。' }, { status: 400 });
    if (token.length < 32) return NextResponse.json({ ok: false, error: 'Runnerトークンはtrim後32文字以上で入力してください。' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('rpa_runners')
      .insert({ runner_id: body.runner_id, runner_name: runnerName, token_hash: hashRunnerToken(token) })
      .select('runner_id, runner_name, is_active, last_heartbeat_at, last_status, current_job_id, created_at, updated_at').single();
    if (error) return NextResponse.json({ ok: false, error: error.code === '23505' ? 'このRunner IDは既に登録されています。' : 'Runnerを登録できませんでした。' }, { status: error.code === '23505' ? 409 : 500 });
    return NextResponse.json({ ok: true, runner: safeRunner(data as Record<string, unknown>) }, { status: 201 });
  } catch (error) { return adminError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body: unknown = await request.json();
    if (!isRecord(body) || !isRunnerId(body.runner_id)) return NextResponse.json({ ok: false, error: 'Runner IDが不正です。' }, { status: 400 });
    const updates: Record<string, unknown> = {};
    if (body.runner_name !== undefined) {
      const runnerName = text(body.runner_name, 100);
      if (!runnerName) return NextResponse.json({ ok: false, error: 'Runner名が不正です。' }, { status: 400 });
      updates.runner_name = runnerName;
    }
    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') return NextResponse.json({ ok: false, error: '有効状態が不正です。' }, { status: 400 });
      updates.is_active = body.is_active;
    }
    if (body.token !== undefined) {
      const token = text(body.token, 500);
      if (!token || token.length < 32) return NextResponse.json({ ok: false, error: 'トークンは32文字以上にしてください。' }, { status: 400 });
      updates.token_hash = hashRunnerToken(token);
    }
    if (Object.keys(updates).length === 0) return NextResponse.json({ ok: false, error: '更新内容がありません。' }, { status: 400 });
    const { data, error } = await supabaseAdmin.from('rpa_runners').update(updates).eq('runner_id', body.runner_id)
      .select('runner_id, runner_name, is_active, last_heartbeat_at, last_status, current_job_id, created_at, updated_at').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: 'Runnerが見つかりません。' }, { status: 404 });
    return NextResponse.json({ ok: true, runner: safeRunner(data as Record<string, unknown>) });
  } catch (error) { return adminError(error); }
}
