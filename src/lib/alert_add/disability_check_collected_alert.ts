// src/lib/alert_add/disability_check_collected_alert.ts
// disability_check の回収未チェック → 20日以降のみ mgr_user_id 宛てにアラートログ（ensureSystemAlert）
// ※提出（LINEWORKS）はこのファイルでは扱わない

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert, type EnsureAlertParams } from "@/lib/alert/ensureSystemAlert";

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

type OrgRow = {
    orgunitid: string;
    orgunitname: string;
    mgr_user_id: string | null;
};

type StaffRow = {
    user_id: string;
    name: string | null;
};

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

async function loadOrgMap(orgunitids: string[]) {
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
}

export async function runDisabilityCheckCollectedAlert(args: {
    dryRun?: boolean;
    targetKaipokeCsId?: string;
    forceDay15Rule?: boolean;
} = {}): Promise<DisabilityCheckCollectedAlertResult> {
    const dryRun = args.dryRun ?? false;

    const now = new Date();
    const day = now.getDate();

    // 「前月分」を見る（既存ロジック踏襲）
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetYm = ymNow(prev);

    if (day < 15 && !args.forceDay15Rule) {
        return {
            enabled: true,
            scanned: 0,
            targetRows: 0,
            alertManagers: 0,
            alertRows: 0,
            errors: 0,
            dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: true,
        };
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
        .eq("year_month", targetYm)
        .in("kaipoke_servicek", ["障害", "移動支援"])
        .eq("is_checked", false);

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const rows = (data ?? []) as unknown as DisabilityCheckViewRow[];
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
            targetYearMonth: targetYm,
            skippedBecauseDay: false,
        };
    }

    const orgIds = Array.from(
        new Set(rows.map((r) => String(r.asigned_org_id ?? "")).filter(Boolean)),
    );
    const orgMap = await loadOrgMap(orgIds);

    // mgr_user_id × 利用者（kaipoke_cs_id）でまとめる（＝利用者別アラート）
    type Pack = {
        orgName: string;
        kaipokeCsId: string;
        clientName: string; // "○○様" or "CS:xxxx"
        items: DisabilityCheckViewRow[]; // 障害/移動支援を同一利用者で列挙
    };

    const byMgrClient = new Map<string, { mgrUserId: string; pack: Pack }>();

    for (const r of rows) {
        const orgunitid = String(r.asigned_org_id ?? "").trim();
        if (!orgunitid) continue;

        const org = orgMap.get(orgunitid);
        const mgrUserId = org?.mgr_user_id ? String(org.mgr_user_id).trim() : "";
        if (!mgrUserId) continue;

        const orgName = (r.asigned_org_name ?? org?.orgunitname ?? "").trim();
        const kaipokeCsId = String(r.kaipoke_cs_id ?? "").trim();
        if (!kaipokeCsId) continue;

        const clientNameRaw = (r.client_name ?? "").trim();
        const clientLabel = clientNameRaw ? `${clientNameRaw}様` : `CS:${kaipokeCsId}`;
        const clientUrl =
            `https://myfamille.shi-on.net/portal/disability-check?ym=${targetYm}&kaipoke_cs_id=${encodeURIComponent(kaipokeCsId)}`;
        const clientName = `<a href="${clientUrl}">${clientLabel}</a>`;

        const key = `${mgrUserId}::${kaipokeCsId}`;
        const cur = byMgrClient.get(key);

        if (!cur) {
            byMgrClient.set(key, { mgrUserId, pack: { orgName, kaipokeCsId, clientName, items: [r] } });
        } else {
            cur.pack.items.push(r);
        }
    }

    let alertManagers = 0;
    let alertRows = 0;
    let errorsCount = 0;

    for (const { mgrUserId, pack } of byMgrClient.values()) {
        const staffIds = Array.from(
            new Set(pack.items.map((it) => String(it.asigned_jisseki_staff_id ?? "")).filter(Boolean)),
        );
        const staffInfoMap = await loadStaffInfoMap(staffIds);

        const lines = pack.items.map((it) => {
            const staffId = String(it.asigned_jisseki_staff_id ?? "").trim();
            const staffName =
                (it.asigned_jisseki_staff_name ?? "").trim() ||
                staffInfoMap.get(staffId)?.name ||
                staffId ||
                "（担当未設定）";

            const labelText = `[${it.kaipoke_servicek}] 担当:${staffName}さん`;
            const detailUrl = staffId
                ? `https://myfamille.shi-on.net/portal/disability-check?ym=${targetYm}&user_id=${encodeURIComponent(staffId)}`
                : "";

            return detailUrl ? `<a href="${detailUrl}">${labelText}</a>` : labelText;
        });

        const message =
            `【実績記録 未チェック】 回収 〈${formatYmJa(targetYm)}分〉\n` +
            `${pack.clientName}\n` +
            `回収チェックが、20日以降で未完了の状態です。\n` +
            `至急ご確認ください。\n\n` +
            `チーム: ${pack.orgName}\n\n` +
            lines.join("\n");

        console.log("[disability_check_collected] payload", {
            mgrUserId,
            kaipoke_cs_id: pack.kaipokeCsId,
            shift_id: `disability_check:collect:${targetYm}:${mgrUserId}:${pack.kaipokeCsId}`,
        });

        try {
            if (!dryRun) {
                const payload: EnsureAlertParams = {
                    user_id: mgrUserId,
                    message,
                    kaipoke_cs_id: pack.kaipokeCsId, // ★追加
                    // 同月・同mgr・同利用者で1件に保つ（既存の考え方を踏襲）
                    shift_id: `disability_check:collect:${targetYm}:${mgrUserId}:${pack.kaipokeCsId}`,
                };
                await ensureSystemAlert(payload);
            }

            alertManagers += 1;
            alertRows += pack.items.length;
        } catch (e: unknown) {
            errorsCount += 1;
            console.error("[disability_check_collected] ensureSystemAlert error", {
                mgrUserId,
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
        targetYearMonth: targetYm,
        skippedBecauseDay: false,
    };
}