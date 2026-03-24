// src/lib/alert_add/disability_check_collected_alert.ts
// disability_check の回収未チェック → 20日以降のみ mgr_user_id 宛てにアラートログ（ensureSystemAlert）
// ※提出（LINEWORKS）はこのファイルでは扱わない

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type DisabilityCheckViewRow = {
    kaipoke_cs_id: string;
    kaipoke_servicek: "障害" | "移動支援";
    year_month: string; // YYYY-MM
    client_name: string | null;
    is_checked: boolean | null; // 回収
    asigned_org_id: string | null;
    asigned_org_name: string | null;
    asigned_jisseki_staff_id: string | null;
    asigned_jisseki_staff_name: string | null;
};

// ★削除でOK
// type OrgRow = {
//     orgunitid: string;
//     orgunitname: string;
//     mgr_user_id: string | null;
// };

/*type StaffRow = {
    user_id: string;
    name: string | null;
};*/

export type DisabilityCheckCollectedAlertResult = {
    enabled: boolean;
    scanned: number;
    targetRows: number;
    alertManagers: number; // 利用者件数（=アラート件数）
    alertRows: number;     // 障害/移動支援 行数
    errors: number;
    dryRun: boolean;
    targetYearMonth: string;
    skippedBecauseDay: boolean;
};

function toErrorMessage(e: unknown) {
    return e instanceof Error ? e.message : String(e);
}

function ymNow(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function formatYmJa(ym: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return ym;
    return `${m[1]}年${Number(m[2])}月`;
}

function parseYmToDate(ym: string) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, 1);
}

function isAlertTargetMonth(ym: string, now: Date) {
    const target = parseYmToDate(ym);
    if (!target) return false;

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const targetMonthStart = new Date(target.getFullYear(), target.getMonth(), 1);

    // 翌月以降（未来月）は対象外
    if (targetMonthStart >= currentMonthStart) return false;

    // 前月かどうか
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (
        targetMonthStart.getFullYear() === prevMonthStart.getFullYear() &&
        targetMonthStart.getMonth() === prevMonthStart.getMonth()
    ) {
        // 前月分は「今月20日以降」だけ表示
        return now.getDate() >= 20;
    }

    // それより前の月は未回収なら表示継続
    return true;
}

async function cancelOldDay15CollectedAlerts() {
    const { error } = await supabaseAdmin
        .from("alert_log")
        .update({
            status: "cancelled",
        })
        .eq("status", "open")
        .eq("status_source", "system")
        .like("shift_id", "disability_check:collect:%")
        .like("message", "%15日以降%");

    if (error) {
        throw new Error(`old day15 alert cancel failed: ${error.message}`);
    }
}

/*async function loadOrgMap(orgunitids: string[]) {
    if (!orgunitids.length) return new Map<string, OrgRow>();

    const { data, error } = await supabaseAdmin
        .from("org")
        .select("orgunitid, orgunitname, mgr_user_id")
        .in("orgunitid", orgunitids);

    if (error) throw new Error(`org select failed: ${error.message}`);

    const map = new Map<string, OrgRow>();
    for (const r of (data ?? []) as OrgRow[]) map.set(r.orgunitid, r);
    return map;
}

async function loadStaffInfoMap(userIds: string[]) {
    if (!userIds.length) return new Map<string, StaffRow>();

    const { data, error } = await supabaseAdmin
        .from("users")
        .select("user_id, name")
        .in("user_id", userIds);

    if (error) throw new Error(`users select failed: ${error.message}`);

    const map = new Map<string, StaffRow>();
    for (const r of (data ?? []) as StaffRow[]) map.set(r.user_id, r);
    return map;
}*/

export async function runDisabilityCheckCollectedAlert(args: {
    dryRun?: boolean;
    targetKaipokeCsId?: string;
    forceDay20Rule?: boolean;
} = {}): Promise<DisabilityCheckCollectedAlertResult> {
    const dryRun = args.dryRun ?? false;

    const now = new Date();
    //const day = now.getDate();
    const currentYm = ymNow(now);
    const MIN_ALERT_YM = "2026-01";

    // 旧文面（15日以降）の回収アラートを閉じる
    if (!dryRun) {
        await cancelOldDay15CollectedAlerts();
    }

    let q = supabaseAdmin
        .from("disability_check_view")
        .select(
            [
                "kaipoke_cs_id",
                "kaipoke_servicek",
                "year_month",
                "client_name",
                "is_checked",
                "asigned_org_id",
                "asigned_org_name",
                "asigned_jisseki_staff_id",
                "asigned_jisseki_staff_name",
            ].join(","),
        )
        .gte("year_month", MIN_ALERT_YM) // ★ 2026-01より前は出さない
        .lte("year_month", currentYm)
        .in("kaipoke_servicek", ["障害", "移動支援"])
        .eq("is_checked", false);

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const fetchedRows = (data ?? []) as unknown as DisabilityCheckViewRow[];

    const rows = fetchedRows.filter((r) => {
        if (args.targetKaipokeCsId && r.kaipoke_cs_id !== args.targetKaipokeCsId) return false;
        if (args.forceDay20Rule) return true;
        return isAlertTargetMonth(r.year_month, now);
    });

    const scanned = rows.length;

    if (!rows.length) {
        return {
            enabled: true,
            scanned,
            targetRows: 0,
            alertManagers: 0,
            alertRows: 0,
            errors: 0,
            dryRun,
            targetYearMonth: currentYm,
            skippedBecauseDay: false,
        };
    }

    /*const orgIds = Array.from(
        new Set(rows.map((r) => String(r.asigned_org_id ?? "")).filter(Boolean)),
    );
    const orgMap = await loadOrgMap(orgIds);*/

    // mgr_user_id × 利用者（kaipoke_cs_id）でまとめる（＝利用者別アラート）
    type Pack = {
        yearMonth: string;
        orgName: string;
        kaipokeCsId: string;
        clientName: string;
        items: DisabilityCheckViewRow[];
    };

    const byClient = new Map<string, Pack>();

    for (const r of rows) {
        const orgName = (r.asigned_org_name ?? "").trim();
        const kaipokeCsId = String(r.kaipoke_cs_id ?? "").trim();
        if (!kaipokeCsId) continue;

        const clientNameRaw = (r.client_name ?? "").trim();
        const clientLabel = clientNameRaw ? `${clientNameRaw}様` : `CS:${kaipokeCsId}`;
        const clientUrl =
            `https://myfamille.shi-on.net/portal/disability-check?ym=${r.year_month}&kaipoke_cs_id=${encodeURIComponent(kaipokeCsId)}`; const clientName = `<a href="${clientUrl}">${clientLabel}</a>`;

        const packKey = `${r.year_month}:${kaipokeCsId}`;
        const cur = byClient.get(packKey);

        if (!cur) {
            byClient.set(packKey, {
                yearMonth: r.year_month,
                orgName,
                kaipokeCsId,
                clientName,
                items: [r],
            });
        } else {
            cur.items.push(r);
        }
    }

    let alertManagers = 0;
    let alertRows = 0;
    let errorsCount = 0;

    for (const pack of byClient.values()) {
        const lines = pack.items.map((it) => {
            const staffId = String(it.asigned_jisseki_staff_id ?? "").trim();
            const staffName =
                (it.asigned_jisseki_staff_name ?? "").trim() ||
                staffId ||
                "（担当未設定）";

            const labelText = `[${it.kaipoke_servicek}] 担当:${staffName}さん`;
            const detailUrl = staffId
                ? `https://myfamille.shi-on.net/portal/disability-check?ym=${pack.yearMonth}&user_id=${encodeURIComponent(staffId)}`
                : "";

            return detailUrl ? `<a href="${detailUrl}">${labelText}</a>` : labelText;
        });

        const message =
            `【実績記録 未チェック】 回収 〈${formatYmJa(pack.yearMonth)}分〉\n` + `${pack.clientName}\n` +
            `回収チェックが、20日以降で未完了の状態です。\n` +
            `至急ご確認ください。\n\n` +
            `チーム: ${pack.orgName}\n\n` +
            lines.join("\n");

        console.log("[disability_check_collected] payload", {
            kaipoke_cs_id: pack.kaipokeCsId,
            shift_id: `disability_check:collect:${pack.yearMonth}:${pack.kaipokeCsId}`,
        });

        try {
            if (!dryRun) {
                await ensureSystemAlert({
                    message,
                    kaipoke_cs_id: pack.kaipokeCsId,
                    shift_id: `disability_check:collect:${pack.yearMonth}:${pack.kaipokeCsId}`,
                    user_id: null,
                    rpa_request_id: null,
                });
            }

            alertManagers += 1;
            alertRows += pack.items.length;
        } catch (e: unknown) {
            errorsCount += 1;
            console.error("[disability_check_collected] ensureSystemAlert error", {
                kaipoke_cs_id: pack.kaipokeCsId,
                error: toErrorMessage(e),
            });
        }
    }

    return {
        enabled: true,
        scanned,
        targetRows: rows.length,
        alertManagers,
        alertRows,
        errors: errorsCount,
        dryRun,
        targetYearMonth: currentYm,
        skippedBecauseDay: false,
    };
}