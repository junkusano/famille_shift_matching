// app/api/shift-assign-after-rpa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

type AssignResult = {
    status: 'assigned' | 'replaced' | 'error' | 'noop';
    slot?: 'staff_01' | 'staff_02' | 'staff_03';
    message?: string;
};

export async function POST(req: NextRequest) {
    const stages: Array<Record<string, unknown>> = [];
    const now = () => new Date().toISOString();
    let apiLogError: string | null = null;

    // ★ 常時ログ ON
    const shouldLog = true;

    // for DB log
    let shiftIdForLog: number | null = null;
    let requestedByForLog: string | null = null;
    let accompanyForLog: boolean | null = null;

    try {
        const body = await req.json();
        stages.push({ t: now(), stage: 'parsed_body', keys: Object.keys(body ?? {}) });
        console.log('[AFTER-RPA] parsed_body', Object.keys(body ?? {}));

        const {
            shift_id,
            requested_by_user_id,  // ← users.user_id（社内ID）
            accompany = true,
            role_code = null,
        } = body ?? {};

        shiftIdForLog = Number(shift_id) || null;
        requestedByForLog = requested_by_user_id ?? null;
        accompanyForLog = !!accompany;

        if (!shift_id || !requested_by_user_id) {
            apiLogError = 'bad request';
            stages.push({ t: now(), stage: 'bad_request' });
            console.log('[AFTER-RPA] bad_request');
            return NextResponse.json({ error: 'bad request', stages }, { status: 400 });
        }

        // RPC 呼び出し
        stages.push({ t: now(), stage: 'rpc_call', shift_id, requested_by_user_id, accompany });
        console.log('[AFTER-RPA] rpc_call', { shift_id, requested_by_user_id, accompany });

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
            console.error('[AFTER-RPA] rpc_error', assignErr.message);
            return NextResponse.json({ error: '割当処理に失敗しました', stages }, { status: 500 });
        }

        const assign: AssignResult = (assignRes as AssignResult | null) ?? { status: 'error' };
        stages.push({ t: now(), stage: 'rpc_done', assign });
        console.log('[AFTER-RPA] rpc_done', assign);

        if (assign.status === 'error') {
            const msg =
                assign.message ||
                '交代できる人が見つけられないため、希望シフトを登録できませんでした。マネジャーに問い合わせください';
            apiLogError = msg;
            console.warn('[AFTER-RPA] replace_not_possible', msg);
            return NextResponse.json({ ok: false, assign, stages, error: msg }, { status: 409 });
        }

        stages.push({ t: now(), stage: 'done' });
        console.log('[AFTER-RPA] done');
        return NextResponse.json({ ok: true, assign, stages });
    } catch (e: unknown) {
        // ← anyをやめてunknownで受ける
        const msg =
            e instanceof Error
                ? e.message
                : typeof e === 'string'
                    ? e
                    : JSON.stringify(e);

        apiLogError = msg;
        stages.push({ t: now(), stage: 'exception', error: msg });

        // Vercelの関数ログに必ず出す
        console.error('[AFTER-RPA] exception', msg);

        // クライアントへはエラー内容＋ステージを返す
        return NextResponse.json(
            { error: 'サーバーエラーが発生しました', stages },
            { status: 500 }
        );
    } finally {
        // ← ここは必ず実行される（レスポンス返却前に）
        try {
            // 常時ログ保存したい場合は shouldLog を true にしておく
            if (shouldLog) {
                await supabaseAdmin.from('api_shift_coord_log').insert({
                    path: '/api/shift-assign-after-rpa',
                    requester_auth_id: req.headers.get('x-client-info') ?? null,
                    requested_by_user_id: requestedByForLog,
                    shift_id: shiftIdForLog,
                    accompany: accompanyForLog,
                    stages,
                    error: apiLogError,
                });
                console.log('[AFTER-RPA] api log saved');
            }
        } catch (logErr) {
            // ここで失敗しても本処理へ影響させない
            const m =
                logErr instanceof Error ? logErr.message : JSON.stringify(logErr);
            console.error('[AFTER-RPA] api log save failed', m);
        }
    }
}
