// src/lib/alert_add/disability_check_unsubmitted_alert.ts
// disability_check の提出未チェック → 10日以降のみ LINEWORKS（利用者別：利用者名 + 「情報連携」グループへ送信）
// disability_check の回収未チェック → 15日以降のみ mgr_user_id 宛てにアラートログ

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert, type EnsureAlertParams } from "@/lib/alert/ensureSystemAlert";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

type DisabilityCheckViewRow = {
    kaipoke_cs_id: string;
    kaipoke_servicek: "障害" | "移動支援";
    year_month: string; // "YYYY-MM"

    client_name: string | null;
    is_checked: boolean | null; // 回収（viewは集計なのでnullもありえる）

    asigned_jisseki_staff_id: string | null;      // 担当者ID（URL user_id と一致）
    asigned_jisseki_staff_name: string | null;    // 担当者名（表示用）

    asigned_org_id: string | null;                // チームID（回収アラートのmgr解決用）
    asigned_org_name: string | null;              // チーム名（本文用）

    application_check: boolean | null;            // 提出（今回 view に追加済み）
};

export type DisabilityCheckDailyAlertResult = {
    submitted: {
        enabled: boolean;
        scanned: number;
        targetRows: number;
        sentRooms: number;
        sentRows: number;
        errors: number;
        dryRun: boolean;
        targetYearMonth: string;
        skippedBecauseDay: boolean;
    };
    collected: {
        enabled: boolean;
        scanned: number;
        targetRows: number;
        alertManagers: number;
        alertRows: number;
        errors: number;
        dryRun: boolean;
        targetYearMonth: string;
        skippedBecauseDay: boolean;
    };
};

export type DisabilityCheckAlertArgs = {
    dryRun?: boolean;
    mode?: "all" | "collectedOnly" | "submittedOnly";
    targetKaipokeCsId?: string; // テスト用に1件へ絞る
    forceDay10Rule?: boolean; // 10日条件を無視してテスト
    forceDay15Rule?: boolean; // 15日条件を無視してテスト
};

type OrgRow = {
    orgunitid: string;
    orgunitname: string;
    mgr_user_id: string | null;
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function ymNow(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function toErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "unknown error";
    }
}

/**
 * shift_record_check と同じ方式：
 * group_lw_channel_view から「情報連携」かつ「チーム名(orgName)」の channel_id を取る
 */
/**
 * 利用者名 + 「情報連携」を含むグループへ送る（groups_lw を参照）
 * groups_lw.group_id を sendLWBotMessage の宛先（channelId相当）として使う
 */
/**
 * 利用者名 +「情報連携」を含む groups_lw を見つけ、
 * その group_id から group_lw_channel_view で channel_id を引いて返す
 * （LINEWORKS送信先は channel_id）
 */
type LwGroupRow = { group_id: string; group_name: string };

async function loadActiveInfoRenkeiGroups(): Promise<LwGroupRow[]> {
    const { data, error } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id, group_name")
        .eq("is_active", true)
        .ilike("group_name", "%情報連携%")
        .limit(5000);

    if (error) throw new Error(`groups_lw select failed: ${error.message}`);
    return (data ?? []) as LwGroupRow[];
}

function findGroupIdForClientName(clientName: string, groups: LwGroupRow[]): string {
    const rawName = (clientName ?? "").trim();
    if (!rawName) throw new Error("clientName is empty");

    const key = rawName.replace(/[\s　]+/g, "");
    const normalize = (s: string) => s.replace(/[\s　]+/g, "");

    const hit = groups.find((r) => {
        const n = normalize(r.group_name ?? "");
        if (!n) return false;
        if (n.includes("不使用") || n.includes("使わない") || n.includes("（つかわない）")) return false;
        return n.includes(key);
    });

    const groupId = String(hit?.group_id ?? "").trim();
    if (!groupId) {
        throw new Error(
            `LINEWORKS group_id not found. group_name includes "情報連携" and clientName="${rawName}"`
        );
    }
    return groupId;
}

async function resolveChannelIdFromGroupId(groupId: string, cache: Map<string, string>): Promise<string> {
    const cached = cache.get(groupId);
    if (cached) return cached;

    const { data: cData, error: cErr } = await supabaseAdmin
        .from("group_lw_channel_view")
        .select("channel_id, group_id")
        .eq("group_id", groupId)
        .maybeSingle();

    if (cErr) throw new Error(`group_lw_channel_view select failed: ${cErr.message}`);

    const channelId = String(cData?.channel_id ?? "").trim();
    if (!channelId) {
        throw new Error(`LINEWORKS channel_id not found in group_lw_channel_view for group_id="${groupId}"`);
    }

    cache.set(groupId, channelId);
    return channelId;
}

async function resolveLineworksChannelIdForClientCached(
    clientName: string,
    groups: LwGroupRow[],
    channelCache: Map<string, string>
): Promise<string> {
    const groupId = findGroupIdForClientName(clientName, groups);
    return resolveChannelIdFromGroupId(groupId, channelCache);
}

function formatYmJa(ym: string): string {
    // "2026-01" → "2026年1月"
    const [y, m] = ym.split("-");
    return `${y}年${Number(m)}月`;
}

type StaffInfoRaw = {
    user_id: string | null;
    lw_userid: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
};

type StaffInfo = {
    name: string;
    lw_userid: string | null;
};

async function loadStaffInfoMap(userIds: string[]): Promise<Map<string, StaffInfo>> {
    if (!userIds.length) return new Map();

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id, lw_userid, last_name_kanji, first_name_kanji")
        .in("user_id", userIds);

    if (error) throw error;

    const rows = (data ?? []) as StaffInfoRaw[];

    const map = new Map<string, StaffInfo>();
    for (const r of rows) {
        const id = r.user_id ? String(r.user_id) : "";
        if (!id) continue;

        const last = r.last_name_kanji ? String(r.last_name_kanji) : "";
        const first = r.first_name_kanji ? String(r.first_name_kanji) : "";
        const name = `${last}${first}`.trim() || id;

        map.set(id, {
            name,
            lw_userid: r.lw_userid ? String(r.lw_userid) : null,
        });
    }
    return map;
}

async function loadOrgMap(orgIds: string[]): Promise<Map<string, OrgRow>> {
    if (!orgIds.length) return new Map<string, OrgRow>();

    const { data, error } = await supabaseAdmin
        .from("orgs")
        .select("orgunitid, orgunitname, mgr_user_id")
        .in("orgunitid", orgIds);

    if (error) throw error;

    const map = new Map<string, OrgRow>();
    for (const r of (data ?? []) as OrgRow[]) {
        map.set(String(r.orgunitid), {
            orgunitid: String(r.orgunitid),
            orgunitname: String(r.orgunitname ?? ""),
            mgr_user_id: r.mgr_user_id ? String(r.mgr_user_id) : null,
        });
    }
    return map;
}


/**
 * A) 提出（application_check）未チェック → 10日以降のみ / 当月のみ / チーム別にLINEWORKS送信
 */
async function runSubmittedUncheckLineworksOnly(args: {
    dryRun: boolean;
    targetKaipokeCsId?: string;
    forceDay10Rule?: boolean;
}): Promise<DisabilityCheckDailyAlertResult["submitted"]> {
    const now = new Date();
    const day = now.getDate();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const targetYm = ymNow(prev);

    if (day < 10 && !args.forceDay10Rule) {
        return {
            enabled: true,
            scanned: 0,
            targetRows: 0,
            sentRooms: 0,
            sentRows: 0,
            errors: 0,
            dryRun: args.dryRun,
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
                "asigned_org_name",
                "asigned_jisseki_staff_id",
                "asigned_jisseki_staff_name",
                "application_check",
            ].join(",")
        )
        .eq("year_month", targetYm)
        .in("kaipoke_servicek", ["障害", "移動支援"])
        .eq("application_check", false);

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const rows = (data ?? []) as unknown as DisabilityCheckViewRow[];

    // 最終ガード
    const targetRows = rows.filter(
        (r) => r.application_check === false
    );

    const scanned = targetRows.length;

    if (!targetRows.length) {
        return {
            enabled: true,
            scanned,
            targetRows: 0,
            sentRooms: 0,
            sentRows: 0,
            errors: 0,
            dryRun: args.dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: false,
        };
    }

    // ★送信先グループ候補を1回だけ取得（「情報連携」）
    const infoRenkeiGroups = await loadActiveInfoRenkeiGroups();
    const channelCache = new Map<string, string>();

    // ★利用者(kaipoke_cs_id)ごとにまとめる（ここが最重要）
    const byClient = new Map<string, DisabilityCheckViewRow[]>();
    for (const r of rows) {
        const id = String(r.kaipoke_cs_id ?? "").trim();
        if (!id) continue;
        byClient.set(id, [...(byClient.get(id) ?? []), r]);
    }

    let sentRooms = 0;
    let sentRows = 0;
    let errors = 0;

    const token = await getAccessToken();

    for (const [kaipokeCsId, items] of byClient) {
        try {
            const first = items[0];
            const clientName = (first?.client_name ?? "").trim();
            if (!clientName) throw new Error(`client_name is empty for kaipoke_cs_id="${kaipokeCsId}"`);

            const orgName = (first?.asigned_org_name ?? "").trim();

            const channelId = await resolveLineworksChannelIdForClientCached(clientName, infoRenkeiGroups, channelCache);

            // 担当者メンション（同一利用者内で複数担当があり得るのでユニーク）
            const staffIds = Array.from(
                new Set(items.map((it) => String(it.asigned_jisseki_staff_id ?? "")).filter(Boolean))
            );

            const staffInfoMap = await loadStaffInfoMap(staffIds);

            const mentionLines = staffIds
                .map((sid) => staffInfoMap.get(sid)?.lw_userid)
                .filter((v): v is string => !!v)
                .map((lw) => `<m userId="${lw}">さん`)
                .join("\n");

            // ★同一利用者内で「担当者ごと」にサービス区分を集約して 1行にする
            const byStaff = new Map<string, Set<string>>();

            for (const it of items) {
                const staffId = String(it.asigned_jisseki_staff_id ?? "").trim();
                if (!staffId) continue;

                const set = byStaff.get(staffId) ?? new Set<string>();
                set.add(String(it.kaipoke_servicek)); // "障害" | "移動支援"
                byStaff.set(staffId, set);
            }

            const lines = Array.from(byStaff.entries()).map(([staffId, svcSet]) => {
                const staffName =
                    (items.find(x => String(x.asigned_jisseki_staff_id ?? "").trim() === staffId)?.asigned_jisseki_staff_name ?? "").trim() ||
                    staffInfoMap.get(staffId)?.name ||
                    staffId ||
                    "（担当未設定）";

                const svcLabel = Array.from(svcSet).join("/"); // 例: "移動支援/障害"

                // ★svc を入れない（＝常に「全て」初期表示にしたい）
                const staffUrl = `https://myfamille.shi-on.net/portal/disability-check?ym=${encodeURIComponent(
                    targetYm
                )}&user_id=${encodeURIComponent(staffId)}`;

                const labelText = `${clientName}様 [${svcLabel}] 担当:${staffName}さん`;
                return `${labelText} ${staffUrl}`;
            });

            const message =
                (mentionLines ? `${mentionLines}\n` : "") +
                `【実績記録 未提出】 〈${formatYmJa(targetYm)}分〉\n` +
                `提出チェックが、完了していません。\n` +
                `至急、利用者様から実績記録票をいただき、事業所へ提出（郵送もしくは持参）してください。\n\n` +
                `完了しましたら、実績記録の「提出」にチェックをしてください。\n\n` +
                `チーム: ${orgName}\n\n` +
                lines.join("\n");

            if (!args.dryRun) {
                await sendLWBotMessage(channelId, message, token);
            }

            sentRooms += 1;          // 送った「利用者グループ」数
            sentRows += items.length; // 対象行数（障害/移動支援など）
        } catch (e: unknown) {
            errors += 1;
            console.error("[disability_check_submitted] LINEWORKS send error", {
                kaipokeCsId,
                error: toErrorMessage(e),
            });
        }
    }

    return {
        enabled: true,
        scanned,
        targetRows: rows.length,
        sentRooms,
        sentRows,
        errors,
        dryRun: args.dryRun,
        targetYearMonth: targetYm,
        skippedBecauseDay: false,
    };
}

/**
 * B) 回収（is_checked）未チェック → 15日以降のみ / 当月のみ / mgr_user_id 宛てにアラート作成
 */
async function runCollectedUncheckManagerAlert(args: {
    dryRun: boolean;
    targetKaipokeCsId?: string;
    forceDay15Rule?: boolean;
}): Promise<DisabilityCheckDailyAlertResult["collected"]> {
    const now = new Date();
    const day = now.getDate();
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
            dryRun: args.dryRun,
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
            ].join(",")
        )
        .eq("year_month", targetYm)
        .in("kaipoke_servicek", ["障害", "移動支援"])
        .eq("is_checked", false);

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const rows: DisabilityCheckViewRow[] = (data ?? []) as unknown as DisabilityCheckViewRow[];
    const scanned = rows.length;

    if (!rows.length) {
        return {
            enabled: true,
            scanned,
            targetRows: 0,
            alertManagers: 0,
            alertRows: 0,
            errors: 0,
            dryRun: args.dryRun,
            targetYearMonth: targetYm,
            skippedBecauseDay: false,
        };
    }

    const orgIds = Array.from(new Set(rows.map((r) => String(r.asigned_org_id ?? "")).filter(Boolean)));
    const orgMap = await loadOrgMap(orgIds);

    type ByMgrClientPack = {
        orgName: string;
        kaipokeCsId: string;
        clientName: string; // "○○様" or "CS:xxxx"
        items: DisabilityCheckViewRow[]; // 障害/移動支援（未回収）をまとめる
    };

    const byMgrClient = new Map<string, { mgrUserId: string; pack: ByMgrClientPack }>();

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
        const clientName = clientNameRaw ? `${clientNameRaw}様` : `CS:${kaipokeCsId}`;

        const key = `${mgrUserId}::${kaipokeCsId}`;

        const cur = byMgrClient.get(key);
        if (!cur) {
            byMgrClient.set(key, {
                mgrUserId,
                pack: { orgName, kaipokeCsId, clientName, items: [r] },
            });
        } else {
            cur.pack.items.push(r);
        }
    }

    let alertManagers = 0;
    let alertRows = 0;
    let errors = 0;

    for (const { mgrUserId, pack } of byMgrClient.values()) {
        const staffIds = Array.from(
            new Set(pack.items.map((it) => String(it.asigned_jisseki_staff_id ?? "")).filter(Boolean))
        );
        const staffInfoMap = await loadStaffInfoMap(staffIds);

        // 利用者1人の中で、障害/移動支援（未回収）を列挙
        const lines = pack.items.map((it) => {
            const staffId = String(it.asigned_jisseki_staff_id ?? "").trim();
            const staffName =
                (it.asigned_jisseki_staff_name ?? "").trim() ||
                staffInfoMap.get(staffId)?.name ||
                staffId ||
                "（担当未設定）";

            const labelText = `[${it.kaipoke_servicek}] 担当:${staffName}さん`;

            const detailUrl =
                staffId
                    ? `https://myfamille.shi-on.net/portal/disability-check?ym=${targetYm}&user_id=${encodeURIComponent(staffId)}`
                    : "";

            return detailUrl ? `<a href="${detailUrl}">${labelText}</a>` : labelText;
        });

        const message =
            `【実績記録 未チェック】 回収 〈${formatYmJa(targetYm)}分〉\n` +
            `${pack.clientName}\n` +
            `回収チェックが、15日以降で未完了の状態です。\n` +
            `至急ご確認ください。\n\n` +
            `チーム: ${pack.orgName}\n\n` +
            lines.join("\n");

        try {
            if (!args.dryRun) {
                const payload: EnsureAlertParams = {
                    user_id: mgrUserId,
                    message,
                    // ★利用者ごとに一意になるIDへ変更（同月・同mgr・同利用者で1件に保つ）
                    shift_id: `disability_check:collect:${targetYm}:${mgrUserId}:${pack.kaipokeCsId}`,
                };
                await ensureSystemAlert(payload);
            }

            alertManagers += 1;         // ※件数（=利用者数）
            alertRows += pack.items.length;
        } catch (e: unknown) {
            errors += 1;
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
        errors,
        dryRun: args.dryRun,
        targetYearMonth: targetYm,
        skippedBecauseDay: false,
    };
}

/**
 * cronから呼ぶ統合関数（1日1回で提出/回収を回す）
 */
export async function runDisabilityCheckDailyAlerts(
    args: DisabilityCheckAlertArgs = {},
): Promise<DisabilityCheckDailyAlertResult> {
    const dryRun = args.dryRun ?? false;
    const mode = args.mode ?? "all";

    const submitted =
        mode === "collectedOnly"
            ? {
                enabled: true,
                scanned: 0,
                targetRows: 0,
                sentRooms: 0,
                sentRows: 0,
                errors: 0,
                dryRun,
                targetYearMonth: "",
                skippedBecauseDay: false,
            }
            : await runSubmittedUncheckLineworksOnly({
                dryRun,
                targetKaipokeCsId: args.targetKaipokeCsId,
                forceDay10Rule: args.forceDay10Rule,
            });

    const collected =
        mode === "submittedOnly"
            ? {
                enabled: true,
                scanned: 0,
                targetRows: 0,
                alertManagers: 0,
                alertRows: 0,
                errors: 0,
                dryRun,
                targetYearMonth: "",
                skippedBecauseDay: false,
            }
            : await runCollectedUncheckManagerAlert({
                dryRun,
                targetKaipokeCsId: args.targetKaipokeCsId,
                forceDay15Rule: args.forceDay15Rule,
            });

    return { submitted, collected };
}
