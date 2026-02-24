// src/lib/disability/disability_check_record_check.ts
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type Opts = { dryRun?: boolean };

type DisabilityCheckRow = {
    kaipoke_cs_id: string;
    kaipoke_servicek: string;
    year_month: string;
    is_checked: boolean;
    asigned_jisseki_staff: string | null;
    application_check: boolean | null;
};

type CsKaipokeInfoRow = {
    kaipoke_cs_id: string;
    client_name: string | null;
    orgunitid: string | null;
    orgunitname: string | null;
};

type OrgRow = {
    orgunitid: string;
    orgunitname: string;
    mgr_user_id: string | null;
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

/** サーバ時刻からJSTの「今日」を作る（cron判定用） */
function getJstNow() {
    const now = new Date();
    return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function getYearMonthJst(d: Date) {
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

function formatYmJa(ym: string): string {
    // "2026-01" → "2026年1月"
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return ym;
    return `${m[1]}年${Number(m[2])}月`;
}

/**
 * 仕様:
 * - 月10日以降: application_check != true の行があれば、チームの「情報連携 + グループ名」部屋へ LINEWORKS 送信
 * - 月15日以降: is_checked != true の行があれば、orgs.mgr_user_id 宛てに alert_add (ensureSystemAlert) を追加
 */
export async function runDisabilityCheckRecordCheck(opts: Opts = {}) {
    const dryRun = !!opts.dryRun;
    const nowJst = getJstNow();
    const day = nowJst.getDate();
    const yearMonth = getYearMonthJst(nowJst);

    const doSubmitReminder = day >= 10;
    const doCollectAlert = day >= 15;

    // 早期return（何もしない日）
    if (!doSubmitReminder && !doCollectAlert) {
        return {
            dryRun,
            yearMonth,
            skipped: true,
            reason: "before_day_10",
        };
    }

    // disability_check 取得（当月分のみ）
    const { data: rows, error } = await supabaseAdmin
        .from("disability_check")
        .select(
            "kaipoke_cs_id, kaipoke_servicek, year_month, is_checked, asigned_jisseki_staff, application_check",
        )
        .eq("year_month", yearMonth);

    if (error) throw error;

    const dcRows: DisabilityCheckRow[] = (rows ?? []).map((r) => ({
        kaipoke_cs_id: String((r as { kaipoke_cs_id: unknown }).kaipoke_cs_id),
        kaipoke_servicek: String((r as { kaipoke_servicek: unknown }).kaipoke_servicek),
        year_month: String((r as { year_month: unknown }).year_month),
        is_checked: Boolean((r as { is_checked: unknown }).is_checked),
        asigned_jisseki_staff:
            (r as { asigned_jisseki_staff: unknown }).asigned_jisseki_staff == null
                ? null
                : String((r as { asigned_jisseki_staff: unknown }).asigned_jisseki_staff),
        application_check:
            (r as { application_check: unknown }).application_check == null
                ? null
                : Boolean((r as { application_check: unknown }).application_check),
    }));

    // 利用者のチーム判定に cs_kaipoke_info を参照（orgunitid/orgunitname と利用者名が必要）
    const csIds = Array.from(new Set(dcRows.map((r) => r.kaipoke_cs_id)));

    const { data: csInfos, error: csErr } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id, client_name, orgunitid, orgunitname")
        .in("kaipoke_cs_id", csIds);

    if (csErr) throw csErr;

    const csMap = new Map<string, CsKaipokeInfoRow>();
    for (const c of (csInfos ?? []) as unknown[]) {
        const row = c as Partial<CsKaipokeInfoRow>;
        const csId = String(row.kaipoke_cs_id ?? "");
        if (!csId) continue;

        csMap.set(csId, {
            kaipoke_cs_id: csId,
            client_name: row.client_name ?? null,
            orgunitid: row.orgunitid ?? null,
            orgunitname: row.orgunitname ?? null,
        });
    }

    // orgs から mgr_user_id を引く
    const orgIds = Array.from(
        new Set(
            Array.from(csMap.values())
                .map((c) => c.orgunitid ?? "")
                .filter((v): v is string => !!v),
        ),
    );

    const { data: orgRows, error: orgErr } = await supabaseAdmin
        .from("orgs")
        .select("orgunitid, orgunitname, mgr_user_id")
        .in("orgunitid", orgIds);

    if (orgErr) throw orgErr;

    const orgMap = new Map<string, OrgRow>();
    for (const o of (orgRows ?? []) as unknown[]) {
        const row = o as Partial<OrgRow>;
        const orgId = String(row.orgunitid ?? "");
        if (!orgId) continue;

        orgMap.set(orgId, {
            orgunitid: orgId,
            orgunitname: String(row.orgunitname ?? ""),
            mgr_user_id: row.mgr_user_id == null ? null : String(row.mgr_user_id),
        });
    }
    // チーム単位にまとめる
    type Item = {
        kaipoke_cs_id: string;
        client_name: string;
        servicek: string;
        assigned_staff: string | null;
        orgunitid: string;
        orgunitname: string;
    };

    const unsubmittedByOrg = new Map<string, Item[]>();
    const uncollectedByMgrStaffClient = new Map<
        string,
        {
            mgrUserId: string;
            orgName: string;
            staffId: string;           // 担当者ID
            clientLabel: string;       // "石川 育美様"
            kaipokeCsId: string;
            svcSet: Set<string>;       // ★ "障害"/"移動支援" をまとめる
        }
    >();

    // ★ここは「集計だけ」する（送信・returnは絶対に入れない）
    for (const r of dcRows) {
        const cs = csMap.get(r.kaipoke_cs_id);
        if (!cs?.orgunitid) continue;

        const item: Item = {
            kaipoke_cs_id: r.kaipoke_cs_id,
            client_name: cs.client_name ?? "",
            servicek: r.kaipoke_servicek ?? "",
            assigned_staff: r.asigned_jisseki_staff ? String(r.asigned_jisseki_staff) : null,
            orgunitid: cs.orgunitid,
            orgunitname: cs.orgunitname ?? "",
        };

        // 提出（チーム単位のまま）
        if (doSubmitReminder && r.application_check !== true) {
            const key = item.orgunitid;
            unsubmittedByOrg.set(key, [...(unsubmittedByOrg.get(key) ?? []), item]);
        }

        // 回収（利用者×担当者単位）
        if (doCollectAlert && r.is_checked !== true) {
            const org = orgMap.get(item.orgunitid);
            const mgrUserId = org?.mgr_user_id ? String(org.mgr_user_id).trim() : "";
            if (!mgrUserId) continue;

            const staffId = (item.assigned_staff ?? "").trim(); // ★disability_check.asigned_jisseki_staff
            if (!staffId) continue; // 担当未設定は一旦スキップ（必要なら別ルールで）

            const orgName = org?.orgunitname || item.orgunitname || "";
            const clientLabel = item.client_name ? `${item.client_name}様` : `${item.kaipoke_cs_id}`;
            const kaipokeCsId = item.kaipoke_cs_id;

            // ★ mgr + 担当 + 利用者 で 1件
            const key = `${mgrUserId}::${staffId}::${kaipokeCsId}`;

            const cur = uncollectedByMgrStaffClient.get(key);
            if (!cur) {
                uncollectedByMgrStaffClient.set(key, {
                    mgrUserId,
                    orgName,
                    staffId,
                    clientLabel,
                    kaipokeCsId,
                    svcSet: new Set([item.servicek]),
                });
            } else {
                cur.svcSet.add(item.servicek);
            }
        }
    }

    // ===== 提出：LINEWORKS送信（10日以降） =====
    let lwSentOrgs = 0;
    let lwSentCount = 0;
    const lwErrors: Array<{ orgunitid: string; error: string }> = [];

    if (doSubmitReminder && unsubmittedByOrg.size > 0) {
        const token = await getAccessToken();

        for (const [orgunitid, items] of unsubmittedByOrg) {
            const orgName = orgMap.get(orgunitid)?.orgunitname || items[0]?.orgunitname || "";

            try {
                const roomId = await resolveLineworksRoomIdForOrg(orgName);

                const lines = items.map((it) => {
                    const client = it.client_name ? `${it.client_name}様` : `${it.kaipoke_cs_id}`;
                    const staff = it.assigned_staff ? `${it.assigned_staff}さん` : "（担当未設定）";
                    return `- ${client} [${it.servicek}] 担当: ${staff}`;
                });

                const message =
                    `【実績 提出未チェック】${yearMonth}\n` +
                    `チーム: ${orgName}\n` +
                    `（月10日以降：提出チェックが未入力のもの）\n` +
                    lines.join("\n");

                if (!dryRun) {
                    await sendLWBotMessage(token, roomId, message);
                }

                lwSentOrgs += 1;
                lwSentCount += items.length;
            } catch (e: unknown) {
                lwErrors.push({ orgunitid, error: toErrorMessage(e) });
            }
        }
    }
    // ===== 回収：mgr_user_id へアラート（15日以降） =====
    let alertsCreated = 0;
    const collectErrors: Array<{ key: string; error: string }> = [];

    if (doCollectAlert && uncollectedByMgrStaffClient.size > 0) {
        for (const [key, pack] of uncollectedByMgrStaffClient) {
            const { mgrUserId, orgName, staffId, clientLabel, kaipokeCsId, svcSet } = pack;

            const svcLabel = Array.from(svcSet).join("/"); // "障害/移動支援" など

            // ★あなたの希望フォーマット
            const message =
                `チーム: ${orgName}\n` +
                `担当:${staffId}さん\n` +
                `【実績記録 未チェック】 回収 〈${formatYmJa(yearMonth)}分〉\n` +
                `回収チェックが、15日以降で未完了の状態です。\n` +
                `至急ご確認ください。` +
                `${clientLabel} [${svcLabel}]`;

            try {
                if (!dryRun) {
                    await ensureSystemAlert({
                        user_id: mgrUserId,
                        message,
                        // ★超重要：これが無い/弱いと「同じアラートに上書き」されやすい
                        shift_id: `disability_check:collect:${yearMonth}:${mgrUserId}:${staffId}:${kaipokeCsId}`,
                    } as unknown as Parameters<typeof ensureSystemAlert>[0]);
                }
                alertsCreated += 1;
            } catch (e: unknown) {
                collectErrors.push({ key, error: toErrorMessage(e) });
            }
        }
    }

    return {
        dryRun,
        yearMonth,
        doSubmitReminder,
        doCollectAlert,
        submit: {
            targetOrgs: unsubmittedByOrg.size,
            targetRows: Array.from(unsubmittedByOrg.values()).reduce((a, b) => a + b.length, 0),
            sentOrgs: lwSentOrgs,
            sentRows: lwSentCount,
            errors: lwErrors,
        },
        collect: {
            targetAlerts: uncollectedByMgrStaffClient.size,
            alertAlerts: alertsCreated,
            errors: collectErrors, // ←こっちが正しい
        },
    };
}
/**
 * ★ここだけプロジェクト既存の “shift_record_check と同じ部屋検索” をそのまま移植してください。
 * 要件: 「情報連携」とグループ名(orgName)を含む部屋。
 */
async function resolveLineworksRoomIdForOrg(orgName: string): Promise<string> {
    // TODO: shift_record_check と同じ実装に差し替え
    throw new Error(`resolveLineworksRoomIdForOrg is not implemented. orgName=${orgName}`);
}
