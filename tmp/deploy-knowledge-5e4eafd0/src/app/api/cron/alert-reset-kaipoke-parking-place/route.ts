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

        console.info('[cron][alert-reset-kaipoke-parking-place] start');

        const nowIso = new Date().toISOString();

        const { data: openRows, error: openError } = await supabaseAdmin
            .from('alert_log')
            .select('id, message')
            .eq('status', 'open')
            .in('status_source', ['system'])
            .like('message', '%【駐車場所未入力】%');

        if (openError) {
            console.error('[cron][alert-reset-kaipoke-parking-place] openRows error detail', {
                message: openError.message,
                details: openError.details,
                hint: openError.hint,
                code: openError.code,
            });

            throw new Error(
                `message=${openError.message}, details=${openError.details ?? ''}, hint=${openError.hint ?? ''}, code=${openError.code ?? ''}`
            );
        }

        let updatedCount = 0;
        let deletedDuplicateOpenCount = 0;

        for (const row of openRows ?? []) {
            const { data: doneRow, error: doneError } = await supabaseAdmin
                .from('alert_log')
                .select('id')
                .eq('message', row.message)
                .eq('status', 'done')
                .maybeSingle();

            if (doneError) {
                console.error('[cron][alert-reset-kaipoke-parking-place] doneRow error detail', {
                    message: doneError.message,
                    details: doneError.details,
                    hint: doneError.hint,
                    code: doneError.code,
                    targetId: row.id,
                });

                throw new Error(
                    `message=${doneError.message}, details=${doneError.details ?? ''}, hint=${doneError.hint ?? ''}, code=${doneError.code ?? ''}`
                );
            }

            if (doneRow) {
                const { error: deleteError } = await supabaseAdmin
                    .from('alert_log')
                    .delete()
                    .eq('id', row.id);

                if (deleteError) {
                    console.error('[cron][alert-reset-kaipoke-parking-place] delete duplicate open error detail', {
                        message: deleteError.message,
                        details: deleteError.details,
                        hint: deleteError.hint,
                        code: deleteError.code,
                        targetId: row.id,
                    });

                    throw new Error(
                        `message=${deleteError.message}, details=${deleteError.details ?? ''}, hint=${deleteError.hint ?? ''}, code=${deleteError.code ?? ''}`
                    );
                }

                deletedDuplicateOpenCount++;
                continue;
            }

            const { error: updateError } = await supabaseAdmin
                .from('alert_log')
                .update({
                    status: 'done',
                    status_source: 'auto_done',
                    updated_at: nowIso,
                })
                .eq('id', row.id);

            if (updateError) {
                console.error('[cron][alert-reset-kaipoke-parking-place] update error detail', {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint,
                    code: updateError.code,
                    targetId: row.id,
                });

                throw new Error(
                    `message=${updateError.message}, details=${updateError.details ?? ''}, hint=${updateError.hint ?? ''}, code=${updateError.code ?? ''}`
                );
            }

            updatedCount++;
        }

        console.info('[cron][alert-reset-kaipoke-parking-place] end', {
            openCount: openRows?.length ?? 0,
            deletedDuplicateOpenCount,
            updatedCount,
        });

        const result: Body = {
            ok: true,
            updatedCount,
        };

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        console.error('[cron][alert-reset-kaipoke-parking-place] error', msg);

        const result: Body = {
            ok: false,
            error: msg,
        };

        return NextResponse.json(result, { status: 500 });
    }
}