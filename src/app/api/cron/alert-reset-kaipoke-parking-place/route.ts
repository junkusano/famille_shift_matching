export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { assertCronAuth } from '@/lib/cron/auth';
import { supabaseAdmin } from '@/lib/supabase/service';

function addMonths(date: Date, months: number) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
}

function toYmd(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
    try {
        assertCronAuth(req);

        console.info('[cron][alert-reset-kaipoke-parking-place] start');

        const nowIso = new Date().toISOString();
        const today = new Date();
        const end = addMonths(today, 2);
        const startDate = toYmd(today);
        const endDate = toYmd(end);

        const { data: openRows, error: openError } = await supabaseAdmin
            .from('alert_log')
            .select('id, message, kaipoke_cs_id')
            .eq('status', 'open')
            .eq('status_source', 'system')
            .like('message', '%【駐車場所未入力】%');

        if (openError) {
            throw new Error(
                `message=${openError.message}, details=${openError.details ?? ''}, hint=${openError.hint ?? ''}, code=${openError.code ?? ''}`
            );
        }

        let updatedCount = 0;

        for (const row of openRows ?? []) {
            let shouldClose = false;
            if (!row.kaipoke_cs_id) {
                shouldClose = true;
            } else {
                const { data: futureShiftRows, error: futureShiftError } = await supabaseAdmin
                    .from('shift')
                    .select('shift_id')
                    .eq('kaipoke_cs_id', row.kaipoke_cs_id)
                    .gte('shift_start_date', startDate)
                    .lte('shift_start_date', endDate)
                    .limit(1);

                if (futureShiftError) {
                    throw new Error(
                        `message=${futureShiftError.message}, details=${futureShiftError.details ?? ''}, hint=${futureShiftError.hint ?? ''}, code=${futureShiftError.code ?? ''}`
                    );
                }

                const { data: parkingRows, error: parkingError } = await supabaseAdmin
                    .from('parking_cs_places')
                    .select('id')
                    .eq('kaipoke_cs_id', row.kaipoke_cs_id)
                    .eq('is_active', true)
                    .limit(1);

                if (parkingError) {
                    throw new Error(
                        `message=${parkingError.message}, details=${parkingError.details ?? ''}, hint=${parkingError.hint ?? ''}, code=${parkingError.code ?? ''}`
                    );
                }

                const hasFutureShift = (futureShiftRows ?? []).length > 0;
                const hasParking = (parkingRows ?? []).length > 0;

                if (!hasFutureShift || hasParking) {
                    shouldClose = true;
                }
            }

            if (!shouldClose) continue;

            const { data: doneRow, error: doneError } = await supabaseAdmin
                .from('alert_log')
                .select('id')
                .eq('message', row.message)
                .eq('status', 'done')
                .maybeSingle();

            if (doneError) {
                throw new Error(
                    `message=${doneError.message}, details=${doneError.details ?? ''}, hint=${doneError.hint ?? ''}, code=${doneError.code ?? ''}`
                );
            }

            if (doneRow) continue;

            const { error: updateError } = await supabaseAdmin
                .from('alert_log')
                .update({
                    status: 'done',
                    status_source: 'auto_done',
                    updated_at: nowIso,
                })
                .eq('id', row.id);

            if (updateError) {
                throw new Error(
                    `message=${updateError.message}, details=${updateError.details ?? ''}, hint=${updateError.hint ?? ''}, code=${updateError.code ?? ''}`
                );
            }

            updatedCount++;
        }

        return NextResponse.json({ ok: true, updatedCount }, { status: 200 });
    } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        console.error('[cron][alert-reset-kaipoke-parking-place] error', msg);

        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}