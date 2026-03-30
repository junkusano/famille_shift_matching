export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { supabaseAdmin } from '@/lib/supabase/service';

type Body = {
    ok: boolean;
    updatedCount?: number;
    error?: string;
};

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        console.info('[cron][alert-reset-system-open] start');

        const nowIso = new Date().toISOString();

        // 1) open/system を取得
        const { data: openRows, error: openError } = await supabaseAdmin
            .from('alert_log')
            .select('id, message')
            .eq('status', 'open')
            .in('status_source', ['system']);

        if (openError) {
            console.error('[cron][alert-reset-system-open] openRows error detail', {
                message: openError.message,
                details: openError.details,
                hint: openError.hint,
                code: openError.code,
            });

            throw new Error(
                `message=${openError.message}, details=${openError.details ?? ''}, hint=${openError.hint ?? ''}, code=${openError.code ?? ''}`
            );
        }

        const messages = [...new Set((openRows ?? []).map((row) => row.message).filter(Boolean))];

        let doneRows: Array<{ message: string }> = [];

        if (messages.length > 0) {
            const { data, error: doneError } = await supabaseAdmin
                .from('alert_log')
                .select('message')
                .eq('status', 'done')
                .in('message', messages);

            if (doneError) {
                console.error('[cron][alert-reset-system-open] doneRows error detail', {
                    message: doneError.message,
                    details: doneError.details,
                    hint: doneError.hint,
                    code: doneError.code,
                });

                throw new Error(
                    `message=${doneError.message}, details=${doneError.details ?? ''}, hint=${doneError.hint ?? ''}, code=${doneError.code ?? ''}`
                );
            }

            doneRows = data ?? [];
        }

        const doneMessageSet = new Set(doneRows.map((row) => row.message));
        const targetIds = (openRows ?? [])
            .filter((row) => !doneMessageSet.has(row.message))
            .map((row) => row.id);

        // 2) done が未存在のものだけ更新
        let updatedCount = 0;

        if (targetIds.length > 0) {
            const { count, error: updateError } = await supabaseAdmin
                .from('alert_log')
                .update(
                    {
                        status: 'done',
                        status_source: 'auto_done',
                        updated_at: nowIso,
                    },
                    { count: 'exact' }
                )
                .in('id', targetIds);

            if (updateError) {
                console.error('[cron][alert-reset-system-open] update error detail', {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                    code: updateError.code,
                });

                throw new Error(
                    `message=${updateError.message}, details=${updateError.details ?? ''}, hint=${updateError.hint ?? ''}, code=${updateError.code ?? ''}`
                );
            }

            updatedCount = count ?? 0;
        }

        console.info('[cron][alert-reset-system-open] end', {
            openCount: openRows?.length ?? 0,
            skipAlreadyDoneCount: (openRows?.length ?? 0) - targetIds.length,
            updatedCount,
        });

        const result: Body = {
            ok: true,
            updatedCount,
        };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        console.error('[cron][alert-reset-system-open] error', msg);

        const result: Body = {
            ok: false,
            error: msg,
        };

        return NextResponse.json(result, { status: 500 });
    }
}