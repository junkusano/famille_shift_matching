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

        const { count, error } = await supabaseAdmin
            .from('alert_log')
            .update(
                {
                    status: 'done',
                    status_source: 'auto_done',
                    updated_at: nowIso,
                },
                { count: 'exact' }
            )
            .eq('status', 'open')
            .in('status_source', ['system']);

        if (error) {
            console.error('[cron][alert-reset-system-open] supabase error detail', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
            });

            throw new Error(
                `message=${error.message}, details=${error.details ?? ''}, hint=${error.hint ?? ''}, code=${error.code ?? ''}`
            );
        }

        console.info('[cron][alert-reset-system-open] end', {
            updatedCount: count ?? 0,
        });

        const result: Body = {
            ok: true,
            updatedCount: count ?? 0,
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