// src/lib/alert_add/disability_check_unsubmitted_alert.ts
// disability_check の提出未チェック → 10日以降のみ LINEWORKS（チーム別、「情報連携」+グループ名の部屋）
// disability_check の回収未チェック → 15日以降のみ mgr_user_id 宛てにアラートログ

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert, type EnsureAlertParams } from "@/lib/alert/ensureSystemAlert";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

type DisabilityCheckRow = {
    id: string;
    kaipoke_cs_id: string;
    kaipoke_servicek: "障害" | "移動支援";
    year_month: string; // "YYYY-MM"
    is_checked: boolean; // 回収
    asigned_jisseki_staff: string | null; // 実績担当
    application_check: boolean | null; // 提出
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

type CsInfo = {
    cs_uuid: string;
    kaipoke_cs_id: string;
    name: string | null;
    orgunitid: string | null; // cs_kaipoke_info.asigned_org を入れる
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
async function resolveLineworksChannelIdForClient(clientName: string): Promise<string> {
    const rawName = (clientName ?? "").trim();
    if (!rawName) throw new Error("clientName is empty");

    // 空白揺れ対策（半角/全角スペースを除去）
    const key = rawName.replace(/[\s　]+/g, "");

    // 1) groups_lw から「情報連携」グループ候補を取る（JS側で正規化マッチ）
    const { data: gData, error: gErr } = await supabaseAdmin
        .from("groups_lw")
        .select("group_id, group_name")
        .eq("is_active", true)
        .ilike("group_name", "%情報連携%")
        .limit(2000);

    if (gErr) throw new Error(`groups_lw select failed: ${gErr.message}`);

    const groups = (gData ?? []) as Array<{ group_id: string; group_name: string }>;

    const normalize = (s: string) => s.replace(/[\s　]+/g, "");

    const hit = groups.find((r) => {
        const n = normalize(r.group_name ?? "");
        if (!n) return false;

        // 誤爆除外（必要なら追加）
        if (n.includes("不使用") || n.includes("使わない") || n.includes("（つかわない）")) return false;

        return n.includes(key);
    });

    const groupId = String(hit?.group_id ?? "").trim();
    if (!groupId) {
        throw new Error(
            `LINEWORKS group_id not found in groups_lw. group_name includes "情報連携" and clientName="${rawName}"`,
        );
    }

    // 2) group_id から LINEWORKS送信用の channel_id を引く（ここが今回の修正点）
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

    return channelId;
}

type CsInfoRaw = {
    id: string | null;
    kaipoke_cs_id: string | null;
    name: string | null;
    asigned_org: string | null;
};

async function loadCsInfoMap(csIds: string[]) {
    if (!csIds.length) return new Map<string, CsInfo>();

    const { data, error } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("id, kaipoke_cs_id, name, asigned_org")
        .in("kaipoke_cs_id", csIds);

    if (error) throw error;

    const map = new Map<string, CsInfo>();

    // ★ここで data を安全に CsInfoRaw[] として扱う
    const rows = (data ?? []) as CsInfoRaw[];

    for (const r of rows) {
        const id = r.kaipoke_cs_id ? String(r.kaipoke_cs_id) : "";
        if (!id) continue;

        const csUuid = r.id ? String(r.id) : "";
        if (!csUuid) continue;

        map.set(id, {
            cs_uuid: csUuid,
            kaipoke_cs_id: id,
            name: r.name ? String(r.name) : null,
            orgunitid: r.asigned_org ? String(r.asigned_org) : null,
        });
    }

    return map;
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
        .from("disability_check")
        .select(
            "id, kaipoke_cs_id, kaipoke_servicek, year_month, is_checked, asigned_jisseki_staff, application_check",
        )
        .eq("year_month", targetYm)
        .or("application_check.is.null,application_check.eq.false");

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const rows: DisabilityCheckRow[] = (data ?? []) as unknown as DisabilityCheckRow[];
    const scanned = rows.length;

    if (!rows.length) {
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

    const csIds = Array.from(new Set(rows.map((r) => String(r.kaipoke_cs_id))));
    const csMap = await loadCsInfoMap(csIds);

    const orgIds = Array.from(
        new Set(
            csIds
                .map((id) => csMap.get(id)?.orgunitid ?? "")
                .filter((v): v is string => !!v),
        ),
    );

    const orgMap = await loadOrgMap(orgIds);

    // orgunitid ごとにまとめる
    const byOrg = new Map<string, DisabilityCheckRow[]>();
    for (const r of rows) {
        const cs = csMap.get(String(r.kaipoke_cs_id));
        const orgunitid = cs?.orgunitid ? String(cs.orgunitid) : "";
        if (!orgunitid) continue;
        byOrg.set(orgunitid, [...(byOrg.get(orgunitid) ?? []), r]);
    }

    let sentRooms = 0;
    let sentRows = 0;
    let errors = 0;

    const token = await getAccessToken();

    for (const [orgunitid, items] of byOrg) {
        const orgName = orgMap.get(orgunitid)?.orgunitname || "";

        try {
            // 代表の利用者名で「情報連携」グループを解決（1件テストなら items[0] でOK）
            const firstCs = csMap.get(String(items[0]?.kaipoke_cs_id ?? ""));
            const clientName = firstCs?.name ? String(firstCs.name) : "";
            const channelId = await resolveLineworksChannelIdForClient(clientName);

            // 担当者名（漢字）を引く（回収アラートと同じ作りに寄せる）
            const staffIds = Array.from(
                new Set(items.map((it) => it.asigned_jisseki_staff).filter((v): v is string => !!v)),
            );
            const staffInfoMap = await loadStaffInfoMap(staffIds);
            const lines = items.map((it) => {
                const csInfo = csMap.get(String(it.kaipoke_cs_id));
                const clientName = csInfo?.name ? `${csInfo.name}様` : `CS:${it.kaipoke_cs_id}`;

                const staffId = it.asigned_jisseki_staff ? String(it.asigned_jisseki_staff) : "";
                const staffInfo = staffId ? staffInfoMap.get(staffId) : null;
                const staffName = staffInfo?.name ? staffInfo.name : staffId ? staffId : "（担当未設定）";
                // ★提出は LINEWORKS なのでURLをそのまま付ける（担当者IDで自動生成）
                const staffUrl =
                    staffId
                        ? `https://myfamille.shi-on.net/portal/disability-check?ym=${targetYm}&svc=${encodeURIComponent(
                            it.kaipoke_servicek,
                        )}&user_id=${encodeURIComponent(staffId)}`
                        : "";

                const labelText = `${clientName} [${it.kaipoke_servicek}] 担当:${staffName}さん`;

                return staffUrl ? `${labelText} ${staffUrl}` : labelText;
            });

            // ★タイトルも要望通り（提出でも「回収未チェック」文言に揃える）
            // 先頭にメンション（検証は1件想定なので items[0] を使う）
            const first = items[0];
            const firstStaffId = first?.asigned_jisseki_staff ? String(first.asigned_jisseki_staff) : "";
            const firstStaff = firstStaffId ? staffInfoMap.get(firstStaffId) : null;
            const mentionLine = firstStaff?.lw_userid
                ? `<m userId="${firstStaff.lw_userid}">さん\n`
                : "";

            const message =
                `${mentionLine}` +
                `【実績記録 未チェック】 提出 〈${formatYmJa(targetYm)}分〉\n` +
                `提出チェックが、10日以降で未完了の状態です。\n` +
                `至急ご確認ください。\n\n` +
                `チーム: ${orgName}\n\n` +
                lines.join("\n");

            if (!args.dryRun) {
                await sendLWBotMessage(channelId, message, token);
            }

            sentRooms += 1;
            sentRows += items.length;
        } catch (e: unknown) {
            errors += 1;
            console.error("[disability_check_submitted] LINEWORKS send error", {
                orgunitid,
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
        .from("disability_check")
        .select(
            "id, kaipoke_cs_id, kaipoke_servicek, year_month, is_checked, asigned_jisseki_staff, application_check",
        )
        .eq("year_month", targetYm)
        .neq("is_checked", true);

    if (args.targetKaipokeCsId) q = q.eq("kaipoke_cs_id", args.targetKaipokeCsId);

    const { data, error } = await q;
    if (error) throw new Error(`disability_check select failed: ${error.message}`);

    const rows: DisabilityCheckRow[] = (data ?? []) as unknown as DisabilityCheckRow[];
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

    const csIds = Array.from(new Set(rows.map((r) => String(r.kaipoke_cs_id))));
    const csMap = await loadCsInfoMap(csIds);

    const orgIds = Array.from(
        new Set(
            csIds
                .map((id) => csMap.get(id)?.orgunitid ?? "")
                .filter((v): v is string => !!v),
        ),
    );
    const orgMap = await loadOrgMap(orgIds);

    const byMgr = new Map<string, { orgName: string; items: DisabilityCheckRow[] }>();

    for (const r of rows) {
        const cs = csMap.get(String(r.kaipoke_cs_id));
        const orgunitid = cs?.orgunitid ? String(cs.orgunitid) : "";
        if (!orgunitid) continue;

        const org = orgMap.get(orgunitid);
        const mgr = org?.mgr_user_id ? String(org.mgr_user_id) : "";
        if (!mgr) continue;

        const orgName = orgMap.get(orgunitid)?.orgunitname || "";

        const cur = byMgr.get(mgr);
        if (!cur) byMgr.set(mgr, { orgName, items: [r] });
        else cur.items.push(r);
    }

    let alertManagers = 0;
    let alertRows = 0;
    let errors = 0;

    for (const [mgrUserId, pack] of byMgr) {

        const staffIds = Array.from(
            new Set(
                pack.items
                    .map((it) => it.asigned_jisseki_staff)
                    .filter((v): v is string => !!v),
            ),
        );

        const staffInfoMap = await loadStaffInfoMap(staffIds);
        const lines = pack.items.map((it) => {
            const csInfo = csMap.get(String(it.kaipoke_cs_id));
            const clientName = csInfo?.name ? `${csInfo.name}様` : `CS:${it.kaipoke_cs_id}`;

            const staffId = it.asigned_jisseki_staff ? String(it.asigned_jisseki_staff) : "";
            const staffInfo = staffId ? staffInfoMap.get(staffId) : null;
            const staffName = staffInfo?.name ? staffInfo.name : staffId ? staffId : "（担当未設定）";

            // ★リンク表示文字列（ここが「服部 雪美様」の代わりに出る部分）
            const labelText = `${clientName} [${it.kaipoke_servicek}] 担当:${staffName}さん`;

            // ★リンク先：kaipoke-info-detail（cs_kaipoke_info.id）
            const detailUrl = csInfo?.cs_uuid
                ? `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${csInfo.cs_uuid}`
                : "";

            return detailUrl
                ? `<a href="${detailUrl}">${labelText}</a>`
                : labelText;
        });

        const message =
            `【実績記録 未チェック】 回収 〈${formatYmJa(targetYm)}分〉\n` +
            `回収チェックが、15日以降で未完了の状態です。\n` +
            `至急ご確認ください。\n\n` +
            `チーム: ${pack.orgName}\n\n` +
            lines.join("\n");

        try {
            if (!args.dryRun) {
                const payload: EnsureAlertParams = {
                    user_id: mgrUserId,
                    message,
                    // shift_id が EnsureAlertParams に存在するなら残してOK。エラーになるなら次の行も消してください。
                    shift_id: `disability_check:collect:${targetYm}:${mgrUserId}`,
                };
                await ensureSystemAlert(payload);
            }

            alertManagers += 1;
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
