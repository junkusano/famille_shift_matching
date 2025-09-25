// src/app/api/shift-assign-after-rpa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

export const runtime = 'nodejs';         // ← Edge回避（service-role必須）
export const dynamic = 'force-dynamic';  // ← キャッシュ無効
export const revalidate = 0;

type AssignResult = {
  status: 'assigned' | 'replaced' | 'error' | 'noop';
  slot?: 'staff_01' | 'staff_02' | 'staff_03';
  message?: string;
};

export async function POST(req: NextRequest) {
  const stages: Array<Record<string, unknown>> = [];
  const now = () => new Date().toISOString();

  let apiLogError: string | null = null;
  let shiftIdForLog: number | null = null;
  let requestedByForLog: string | null = null;
  let accompanyForLog: boolean | null = null;
  let traceId: string =
    req.headers.get('x-trace-id') ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);

  try {
    const body = await req.json();
    // ——— 入場直後に“必ず”1行書く（APIに来てるかの挿し木）
    await supabaseAdmin.from('api_shift_coord_log').insert({
      path: '/api/shift-assign-after-rpa',
      requester_auth_id: req.headers.get('x-client-info') ?? null,
      requested_by_user_id: body?.requested_by_user_id ?? null,
      shift_id: body?.shift_id ?? null,
      accompany: body?.accompany ?? null,
      stages: [{ t: now(), stage: 'entered_api', keys: Object.keys(body ?? {}), traceId }],
      error: null,
      trace_id: traceId, // ※無ければ後述のDDLで列追加（なければ自動無視されます）
    });

    stages.push({ t: now(), stage: 'parsed_body', keys: Object.keys(body ?? {}), traceId });
    console.log('[AFTER-RPA]', traceId, 'parsed_body', Object.keys(body ?? {}));

    const {
      shift_id,
      requested_by_user_id,    // ← users.user_id（社内ID）
      accompany = true,
      role_code = null,
    } = body ?? {};

    shiftIdForLog = Number(shift_id) || null;
    requestedByForLog = requested_by_user_id ?? null;
    accompanyForLog = !!accompany;

    if (!shift_id || !requested_by_user_id) {
      apiLogError = 'bad request';
      stages.push({ t: now(), stage: 'bad_request', traceId });
      console.warn('[AFTER-RPA]', traceId, 'bad_request');
      return NextResponse.json({ error: 'bad request', stages, traceId }, { status: 400 });
    }

    stages.push({ t: now(), stage: 'rpc_call', shift_id, requested_by_user_id, accompany, traceId });
    console.log('[AFTER-RPA]', traceId, 'rpc_call', { shift_id, requested_by_user_id, accompany });

    const { data: assignRes, error: assignErr } = await supabaseAdmin.rpc(
      'assign_user_to_shift',
      {
        p_shift_id: Number(shift_id),
        p_user_id: String(requested_by_user_id),
        p_role_code: role_code,
        p_accompany: !!accompany,
      }
    );

    if (assignErr) {
      apiLogError = `RPC Error: ${assignErr.message}`;
      stages.push({ t: now(), stage: 'rpc_error', error: assignErr.message, traceId });
      console.error('[AFTER-RPA]', traceId, 'rpc_error', assignErr.message);
      return NextResponse.json({ error: '割当処理に失敗しました', stages, traceId }, { status: 500 });
    }

    const assign: AssignResult = (assignRes as AssignResult | null) ?? { status: 'error' };
    stages.push({ t: now(), stage: 'rpc_done', assign, traceId });
    console.log('[AFTER-RPA]', traceId, 'rpc_done', assign);

    if (assign.status === 'error') {
      const msg =
        assign.message ||
        '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
      apiLogError = msg;
      console.warn('[AFTER-RPA]', traceId, 'replace_not_possible', msg);
      return NextResponse.json({ ok: false, assign, stages, error: msg, traceId }, { status: 409 });
    }

    stages.push({ t: now(), stage: 'done', traceId });
    console.log('[AFTER-RPA]', traceId, 'done');
    return NextResponse.json({ ok: true, assign, stages, traceId });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
    apiLogError = msg;
    stages.push({ t: now(), stage: 'exception', error: msg, traceId });
    console.error('[AFTER-RPA]', traceId, 'exception', msg);
    return NextResponse.json({ error: 'サーバーエラーが発生しました', stages, traceId }, { status: 500 });

  } finally {
    // 毎回 DB にAPIログ保存（処理の最後の足跡）
    try {
      await supabaseAdmin.from('api_shift_coord_log').insert({
        path: '/api/shift-assign-after-rpa',
        requester_auth_id: req.headers.get('x-client-info') ?? null,
        requested_by_user_id: requestedByForLog,
        shift_id: shiftIdForLog,
        accompany: accompanyForLog,
        stages,
        error: apiLogError,
        trace_id: traceId,
      });
      console.log('[AFTER-RPA]', traceId, 'api log saved');
    } catch (logErr) {
      const m = logErr instanceof Error ? logErr.message : JSON.stringify(logErr);
      console.error('[AFTER-RPA]', traceId, 'api log save failed', m);
    }
  }
}