// app/api/shift-coordinate-rpa-request/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';

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
            requester_id = requested_by_user_id, // rpa_command_requests の申請者ID（通常は auth user id）
            requested_kaipoke_user_id,
            accompany = true,
            role_code = null,
            time_adjust_note = null,
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
            time_adjust_note,
        };

        // 割当・申請登録・重複判定をDBの1トランザクションで実行する。
        stages.push({ t: now(), stage: 'coordinate_request_rpc' });
        const { data: result, error } = await supabaseAdmin.rpc(
            'create_shift_coordinate_request_v1',
            {
                p_shift_id: Number(shift_id),
                p_user_id: String(requested_by_user_id),
                p_requester_id: String(requester_id),
                p_requested_kaipoke_user_id: requested_kaipoke_user_id ?? null,
                p_accompany: !!accompany,
                p_role_code: role_code,
                p_template_id: String(template_id),
                p_request_details: request_details,
            },
        );

        if (error) {
            apiLogError = `Coordinate request RPC error: ${error.message}`;
            stages.push({ t: now(), stage: 'coordinate_request_rpc_error', error: error.message });
            return NextResponse.json({ error: 'シフト反映と申請登録に失敗しました' }, { status: 500 });
        }

        stages.push({ t: now(), stage: 'done', result });

        return NextResponse.json(result ?? { ok: false, error: '処理結果を取得できませんでした' }, {
            status: result?.ok ? 200 : 409,
        });
    } catch (e: unknown) {
        const msg =
            e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
        apiLogError = msg;
        stages.push({ t: now(), stage: 'exception', error: msg });
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
