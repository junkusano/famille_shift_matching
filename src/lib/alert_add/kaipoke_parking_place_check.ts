import { supabaseAdmin } from '@/lib/supabase/service';

type ShiftRow = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string | null;
};

type CsRow = {
    id: string;
    kaipoke_cs_id: string | null;
    name: string | null;
    asigned_org: string | null;
};

type ParkingRow = {
    kaipoke_cs_id: string | null;
};

type ExistingAlertRow = {
    id: string;
    message: string;
};

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

function formatJpMd(dateStr: string | null) {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${m}月${day}日`;
}

export async function runKaipokeParkingPlaceCheck() {
    const today = new Date();
    const end = addMonths(today, 2);

    const startDate = toYmd(today);
    const endDate = toYmd(end);

    // 1) 今日〜2か月先のシフトを取得
    const { data: shifts, error: shiftError } = await supabaseAdmin
        .from('shift')
        .select('shift_id, kaipoke_cs_id, shift_start_date')
        .gte('shift_start_date', startDate)
        .lte('shift_start_date', endDate)
        .not('kaipoke_cs_id', 'is', null)
        .order('shift_start_date', { ascending: true });

    if (shiftError) {
        throw new Error(
            `shift load failed: message=${shiftError.message}, details=${shiftError.details ?? ''}, hint=${shiftError.hint ?? ''}, code=${shiftError.code ?? ''}`
        );
    }

    const shiftRows = (shifts ?? []) as ShiftRow[];
    const csIds = [
        ...new Set(
            shiftRows
                .map((s) => s.kaipoke_cs_id)
                .filter((v): v is string => !!v)
        ),
    ];

    if (csIds.length === 0) {
        return {
            scannedShiftCount: 0,
            scannedClientCount: 0,
            targetClientCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // 2) 利用者情報を取得
    const { data: csRows, error: csError } = await supabaseAdmin
        .from('cs_kaipoke_info')
        .select('id, kaipoke_cs_id, name, asigned_org')
        .in('kaipoke_cs_id', csIds)
        .eq('is_active', true);

    if (csError) {
        throw new Error(
            `cs_kaipoke_info load failed: message=${csError.message}, details=${csError.details ?? ''}, hint=${csError.hint ?? ''}, code=${csError.code ?? ''}`
        );
    }

    // 3) 駐車場所ありの利用者を取得（is_active=true のみ）
    const { data: parkingRows, error: parkingError } = await supabaseAdmin
        .from('parking_cs_places')
        .select('kaipoke_cs_id')
        .in('kaipoke_cs_id', csIds)
        .eq('is_active', true);

    if (parkingError) {
        throw new Error(
            `parking_cs_places load failed: message=${parkingError.message}, details=${parkingError.details ?? ''}, hint=${parkingError.hint ?? ''}, code=${parkingError.code ?? ''}`
        );
    }

    const csMap = new Map<string, CsRow>();
    for (const row of (csRows ?? []) as CsRow[]) {
        if (row.kaipoke_cs_id) {
            csMap.set(row.kaipoke_cs_id, row);
        }
    }

    const parkingSet = new Set(
        ((parkingRows ?? []) as ParkingRow[])
            .map((r) => r.kaipoke_cs_id)
            .filter((v): v is string => !!v)
    );

    let alertsCreated = 0;
    let alertsUpdated = 0;

    for (const shift of shiftRows) {
        if (!shift.kaipoke_cs_id) continue;

        // 駐車場所が1件でもあれば対象外
        if (parkingSet.has(shift.kaipoke_cs_id)) continue;

        const cs = csMap.get(shift.kaipoke_cs_id);
        if (!cs?.id || !cs?.name || !cs.asigned_org) continue;

        const detailUrl = `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${cs.id}`;
        const shiftDateLabel = formatJpMd(shift.shift_start_date);

        const message =
            `【駐車場所未入力】` +
            `<a href="${detailUrl}" class="text-blue-600 underline">${cs.name}様</a>` +
            `には ${shiftDateLabel}にサービスを実施する予定ですが、駐車場所の情報が入力されていません。至急入力してください。`;

        // 4) 同じ shift_id の open/system アラートがあるか確認
        const { data: existingOpen, error: existingOpenError } = await supabaseAdmin
            .from('alert_log')
            .select('id, message')
            .eq('status', 'open')
            .eq('status_source', 'system')
            .eq('shift_id', String(shift.shift_id))
            .like('message', '%【駐車場所未入力】%')
            .maybeSingle();

        if (existingOpenError) {
            throw new Error(
                `alert_log existing open load failed: message=${existingOpenError.message}, details=${existingOpenError.details ?? ''}, hint=${existingOpenError.hint ?? ''}, code=${existingOpenError.code ?? ''}`
            );
        }

        const existing = (existingOpen ?? null) as ExistingAlertRow | null;

        // 5) 既存 open があれば必要なら文面だけ更新
        if (existing) {
            if (existing.message !== message) {
                const { error: updateError } = await supabaseAdmin
                    .from('alert_log')
                    .update({
                        message,
                        kaipoke_cs_id: shift.kaipoke_cs_id,
                        assigned_org_id: cs.asigned_org,
                    })
                    .eq('id', existing.id);

                if (updateError) {
                    throw new Error(
                        `alert_log update failed: message=${updateError.message}, details=${updateError.details ?? ''}, hint=${updateError.hint ?? ''}, code=${updateError.code ?? ''}`
                    );
                }

                alertsUpdated++;
            }
            continue;
        }

        // 6) 新規作成
        const { error: insertError } = await supabaseAdmin
            .from('alert_log')
            .insert({
                message,
                visible_roles: ['admin', 'manager', 'staff'],
                status: 'open',
                status_source: 'system',
                severity: 3,
                kaipoke_cs_id: shift.kaipoke_cs_id,
                shift_id: String(shift.shift_id),
                assigned_org_id: cs.asigned_org,
                created_by: 'system',
            });

        if (insertError) {
            if (insertError.code === '23505') continue;

            throw new Error(
                `alert_log insert failed: message=${insertError.message}, details=${insertError.details ?? ''}, hint=${insertError.hint ?? ''}, code=${insertError.code ?? ''}`
            );
        }

        alertsCreated++;
    }

    const targetClientCount = shiftRows.filter((shift) => {
        if (!shift.kaipoke_cs_id) return false;
        return !parkingSet.has(shift.kaipoke_cs_id);
    }).length;

    return {
        scannedShiftCount: shiftRows.length,
        scannedClientCount: csIds.length,
        targetClientCount,
        alertsCreated,
        alertsUpdated,
    };
}