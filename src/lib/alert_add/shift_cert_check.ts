// /src/lib/alert_add/shift_cert_check.ts
// 2025-07-01 以降のシフトで、資格条件的に NG なものに alert_log を出す

import { supabaseAdmin } from '@/lib/supabase/service';
import { ensureSystemAlert } from '@/lib/alert/ensureSystemAlert';
import {
    fetchShiftShiftRecordsWithCert,
    type ShiftCertContext,
    type ShiftWithCert,
} from '@/lib/shift/shift_shift_records';
import type { DocMasterRow, DocItemLite, ServiceKey } from '@/lib/certificateJudge';

export type ShiftCertCheckResult = {
    scanned: number;
    alertsCreated: number;
    alertsUpdated: number;
};

export type ShiftCertCheckOptions = {
    /** 対象期間の開始日（デフォルト: 2025-07-01） */
    fromDate?: string; // 'YYYY-MM-DD'
};

const DEFAULT_FROM_DATE = '2025-07-01';

/**
 * 資格 NG シフトに対して alert_log を追加／更新する処理
 *
 * - ShiftCertContext はこのファイル内で構築する
 */
export async function runShiftCertCheck(
    options?: ShiftCertCheckOptions,
): Promise<ShiftCertCheckResult> {
    const fromDate = options?.fromDate ?? DEFAULT_FROM_DATE;

    const certCtx: ShiftCertContext = {
        async getDocMaster(): Promise<DocMasterRow[]> {
            const { data, error } = await supabaseAdmin
                .from("user_doc_master")
                // DocMasterRow に合わせて必要な列＋ alias
                .select("category, label, service_key:doc_group, is_active, sort_order")
                .eq("category", "certificate")
                .eq("is_active", true);

            if (error || !data) {
                const msg = error?.message ?? "no data";
                // テーブルが空 or まだ設定されていない場合は警告だけ出してスキップ
                // eslint-disable-next-line no-console
                console.warn(
                    "[shift_cert_check] user_doc_master(certificate) not available, skip cert judge:",
                    msg,
                );
                return [];
            }

            return data as DocMasterRow[];
        },

        async getCertDocsForUser(userId: string): Promise<DocItemLite[]> {
            // ★ ここは「ユーザーごとの保有書類テーブル」に合わせて後で実装
            // まだテーブル定義が無い前提なので、今は空配列を返して「資格なし扱い」もしないようにする。
            // （fetchShiftShiftRecordsWithCert 側で masterRows.length === 0 の場合は判定をスキップするようにしてある）

            // eslint-disable-next-line no-console
            console.warn(
                "[shift_cert_check] getCertDocsForUser is not implemented; returning empty docs",
                { userId },
            );
            return [];
        },

        async getRequiredServiceKeysForShift(row): Promise<ServiceKey[]> {
            return mapServiceCodeToServiceKeys(row.service_code);
        },
    };
    // 1) 対象シフトの取得（資格判定付き）
    const rowsWithCert = await fetchShiftShiftRecordsWithCert(
        supabaseAdmin,
        { fromDate },
        certCtx,
    );

    if (rowsWithCert.length === 0) {
        console.info('[shift_cert_check] no shifts found', { fromDate });
        return {
            scanned: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    let alertsCreated = 0;
    let alertsUpdated = 0;

    // 2) 各シフトについて資格 NG のものだけアラート
    for (const row of rowsWithCert) {
        if (!needsAlertForRow(row)) {
            // 資格 OK or 判定不能 の場合はアラート不要
            // eslint-disable-next-line no-continue
            continue;
        }

        const message = buildAlertMessage(row);

        const result = await ensureSystemAlert({
            message,
            kaipoke_cs_id: row.kaipoke_cs_id ?? null,
            shift_id: String(row.shift_id),
            user_id: null,
            rpa_request_id: null,
        });

        if (result.created) {
            alertsCreated += 1;
        } else {
            alertsUpdated += 1;
        }
    }

    console.info('[shift_cert_check] done', {
        scanned: rowsWithCert.length,
        alertsCreated,
        alertsUpdated,
        fromDate,
    });

    return {
        scanned: rowsWithCert.length,
        alertsCreated,
        alertsUpdated,
    };
}

// ==============================
// 内部ヘルパ
// ==============================

/**
 * このシフトに対してアラートが必要か？
 * - certSummary.overallOk === false の場合のみ true
 * - overallOk が null（判定不能）の場合はアラートを出さない
 */
function needsAlertForRow(row: ShiftWithCert): boolean {
    if (!row.certSummary) return false;
    if (row.certSummary.overallOk === false) return true;
    return false;
}

function buildAlertMessage(row: ShiftWithCert): string {
    const clientName =
        row.client_name && row.client_name.trim().length > 0
            ? row.client_name
            : '（利用者名なし）';

    const timePart = buildTimePart(row.shift_start_time);
    const service = row.service_code ?? 'サービス不明';

    const reasons = row.certSummary?.reasons ?? [];
    const uniqueReasons = Array.from(new Set<string>(reasons)).filter(
        (r) => r.trim().length > 0,
    );

    const reasonText =
        uniqueReasons.length > 0 ? `理由：${uniqueReasons.join(' / ')}` : '';

    const base = `【要確認】シフト資格未整備：${clientName}（CS ID: ${row.kaipoke_cs_id ?? '不明'
        }） ${row.shift_start_date}${timePart} サービス: ${service}`;

    if (!reasonText) {
        return base;
    }

    return `${base} / ${reasonText}`;
}

function buildTimePart(shiftStartTime: string | null): string {
    if (!shiftStartTime) return '';
    // 'HH:MM:SS' → ' HH:MM' までにする
    const parts = shiftStartTime.split(':');
    if (parts.length < 2) return '';
    const hhmm = `${parts[0]}:${parts[1]}`;
    return ` ${hhmm}`;
}

/**
 * service_code → ServiceKey[] の簡易マッピング
 * 必要に応じてプロジェクト側で拡張してください。
 */
function mapServiceCodeToServiceKeys(code: string | null): ServiceKey[] {
    if (!code) return [];

    switch (code) {
        case '行動援護':
            return ['mobility'];
        case '移動支援':
            return ['mobility'];
        default:
            // 未定義のサービスコードは「判定不能」とする
            return [];
    }
}
