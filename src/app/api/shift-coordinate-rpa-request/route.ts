// app/api/shift-assign-after-rpa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

type AssignResult = {
  status: 'assigned' | 'replaced' | 'error' | 'noop';
  slot?: 'staff_01' | 'staff_02' | 'staff_03';
  message?: string;
};

export async function POST(req: NextRequest) {
  const stages: Array<Record<string, unknown>> = []; // 簡易ステージログ
  const now = () => new Date().toISOString();
  let errorMsg: string | null = null;

  try {
    const body = await req.json();
    stages.push({ t: now(), stage: 'parsed_body', keys: Object.keys(body ?? {}) });

    const {
      shift_id,
      requested_by_user_id, // ← ここは社内の users.user_id（= accountId）を渡す
      accompany = true,
      role_code = null,
    } = body ?? {};

    if (!shift_id || !requested_by_user_id) {
      errorMsg = 'bad request';
      stages.push({ t: now(), stage: 'bad_request' });
      return NextResponse.json({ error: 'bad request', stages }, { status: 400 });
    }

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
      errorMsg = `RPC Error: ${assignErr.message}`;
      stages.push({ t: now(), stage: 'rpc_error', error: assignErr.message });
      return NextResponse.json({ error: '割当処理に失敗しました', stages }, { status: 500 });
    }

    const assign: AssignResult = (assignRes as AssignResult | null) ?? { status: 'error' };
    stages.push({ t: now(), stage: 'rpc_done', assign });

    if (assign.status === 'error') {
      const msg =
        assign.message ||
        '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
      errorMsg = msg;
      return NextResponse.json({ ok: false, assign, stages, error: msg }, { status: 409 });
    }

    stages.push({ t: now(), stage: 'done' });
    return NextResponse.json({ ok: true, assign, stages });
  } catch (e) {
    errorMsg = e?.message ?? String(e);
    stages.push({ t: now(), stage: 'exception', error: errorMsg });
    return NextResponse.json({ error: 'サーバーエラーが発生しました', stages }, { status: 500 });
  }
}
