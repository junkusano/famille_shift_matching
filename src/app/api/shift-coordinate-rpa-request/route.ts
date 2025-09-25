// app/api/shift-coordinate-rpa-request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

// RPCの戻り値型
type AssignResult = {
  status: 'assigned' | 'replaced' | 'error' | 'noop';
  slot?: 'staff_01' | 'staff_02' | 'staff_03';
  message?: string;
};

export async function POST(req: NextRequest) {
  // ---- APIロギング用 ----
  const stages: Array<Record<string, unknown>> = [];
  const now = () => new Date().toISOString();
  let apiLogError: string | null = null;
  let shouldLog = false;                  // ← 本文の debug で切り替え
  let shiftIdForLog: number | null = null;
  let requestedByForLog: string | null = null;
  let accompanyForLog: boolean | null = null;

  try {
    const body = await req.json();
    stages.push({ t: now(), stage: 'parsed_body', bodyKeys: Object.keys(body ?? {}) });

    // debug フラグ（未使用警告回避しつつ実際に使う）
    shouldLog = !!body?.debug;

    const {
      // shift 基本
      shift_id,
      kaipoke_cs_id,
      shift_start_date,
      shift_start_time,
      shift_end_time,
      service_code,
      postal_code_3,
      client_name,
      // 依頼者情報
      requested_by_user_id,        // ※ shift.staff_**_user_id と同じ体系のIDを渡す
      requested_kaipoke_user_id,
      accompany = true,
      role_code = null,
      // RPA テンプレ
      template_id = '92932ea2-b450-4ed0-a07b-4888750da641',
    } = body ?? {};

    // ログ用に控えておく
    shiftIdForLog = Number(shift_id) || null;
    requestedByForLog = requested_by_user_id ?? null;
    accompanyForLog = !!accompany;

    if (!shift_id || !requested_by_user_id) {
      apiLogError = 'bad request';
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    // 1) shift を先に確定（RPC）
    stages.push({ t: now(), stage: 'rpc_call', shift_id, requested_by_user_id, accompany });
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
      stages.push({ t: now(), stage: 'rpc_error', error: assignErr.message });
      return NextResponse.json({ error: '割当処理に失敗しました' }, { status: 500 });
    }

    const res: AssignResult = (assignRes as AssignResult | null) ?? { status: 'error' };
    stages.push({ t: now(), stage: 'rpc_done', res });

    if (res.status === 'error') {
      const msg =
        res.message ||
        '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
      apiLogError = msg;
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // 2) 成功時のみ RPA リクエスト登録
    stages.push({ t: now(), stage: 'rpa_insert_try' });
    const request_details = {
      shift_id,
      kaipoke_cs_id,
      shift_start_date,
      shift_start_time,
      shift_end_time,
      service_code,
      postal_code_3,
      client_name,
      requested_by: requested_by_user_id,
      requested_kaipoke_user_id,
      attend_request: !!accompany,
    };

    const { error } = await supabaseAdmin
      .from('rpa_command_requests')
      .insert({
        template_id,
        requester_id: requested_by_user_id,
        approver_id: requested_by_user_id,
        status: 'approved',
        request_details,
      });

    if (error) {
      apiLogError = `RPA insert error: ${error.message}`;
      stages.push({ t: now(), stage: 'rpa_insert_error', error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    stages.push({ t: now(), stage: 'done' });

    return NextResponse.json({ ok: true, assign: res });
  } catch (e) {
    apiLogError = e?.message ?? String(e);
    stages.push({ t: now(), stage: 'exception', error: apiLogError });
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  } finally {
    // デバッグ時だけAPIログを保存（常時保存したいなら if を外す）
    try {
      if (shouldLog) {
        await supabaseAdmin.from('api_shift_coord_log').insert({
          path: '/api/shift-coordinate-rpa-request',
          requester_auth_id: req.headers.get('x-client-info'), // 任意
          requested_by_user_id: requestedByForLog,
          shift_id: shiftIdForLog,
          accompany: accompanyForLog,
          stages,
          error: apiLogError,
        });
      }
    } catch {
      // ログ保存の失敗はユーザーに返さない
    }
  }
}

