// src/lib/alert_add/kaipoke_cs_fax_check.ts
//
// 目的：
// - cs_kaipoke_info.care_consultant が未登録
// - または care_consultant 登録済みだが fax(email) が未登録
// を alert_log（ensureSystemAlert）で管理する。
//
// 対象：直近1か月〜今日（JST）の間に shift がある利用者（kaipoke_cs_id）だけ。
// 99999999* は除外。is_active=false も除外。

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type ShiftRow = {
    shift_id: number;
    kaipoke_cs_id: string | null;
    shift_start_date: string | null; // YYYY-MM-DD
};

type ClientRow = {
    id: string; // cs_kaipoke_info.id
    kaipoke_cs_id: string;
    name: string | null;
    care_consultant: string | null; // ★ここは fax.id(uuid) を想定
    is_active?: boolean | null;
};

type FaxRow = {
    id: string; // fax.id
    fax: string; // not null（ただし空文字の可能性は一応ケア）
    email: string | null;
    office_name: string | null;
    service_kind: string | null;
    postal_code: string | null;
};

export type KaipokeCsFaxCheckResult = {
    scannedShiftCount: number;
    scannedClientCount: number;
    targetClientCount: number;
    alertsCreated: number;
    alertsUpdated: number;
};

function todayJstYmd(): string {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
        new Date(),
    ); // YYYY-MM-DD
}

function calcFromDate1Month(): string {
    const ymd = todayJstYmd();
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() - 1);
    return dt.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}

function buildDetailUrl(csKaipokeInfoId: string): string {
    return `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${csKaipokeInfoId}`;
}

function buildMsgNoConsultant(c: ClientRow): string {
    const name = c.name ?? "利用者名不明";
    const csId = c.kaipoke_cs_id;
    const url = buildDetailUrl(c.id);

    return [
        `【相談支援 未登録】相談支援（care_consultant）が登録されていません：${name} 様（CS ID: ${csId}）`,
        `相談支援事業所（FAX/Email）を登録してください。`,
        `利用者情報ページ: ${url}`,
    ].join(" ");
}

function buildMsgMissingContact(c: ClientRow, fx: FaxRow | null, missingFax: boolean, missingEmail: boolean): string {
    const name = c.name ?? "利用者名不明";
    const csId = c.kaipoke_cs_id;
    const url = buildDetailUrl(c.id);

    const office = (fx?.office_name ?? "").trim() || "事業所名不明";
    const faxVal = (fx?.fax ?? "").trim();
    const emailVal = (fx?.email ?? "").trim();

    const missingParts: string[] = [];
    if (missingFax) missingParts.push("FAX");
    if (missingEmail) missingParts.push("Email");

    return [
        `【相談支援 連絡先未登録】相談支援は登録済みですが ${missingParts.join("/")} が未登録です：${name} 様（CS ID: ${csId}）`,
        `相談支援事業所: ${office}`,
        `FAX: ${faxVal || "（未登録）"}`,
        `Email: ${emailVal || "（未登録）"}`,
        `利用者情報ページ: ${url}`,
    ].join(" ");
}

export async function runKaipokeCsFaxCheck(): Promise<KaipokeCsFaxCheckResult> {
    const fromDate = calcFromDate1Month();
    const toDate = todayJstYmd();

    // 1) 直近1ヶ月〜今日のシフト（過去のみ）
    const { data: shiftRowsRaw, error: shiftError } = await supabaseAdmin
        .from("shift")
        .select("shift_id, kaipoke_cs_id, shift_start_date")
        .gte("shift_start_date", fromDate)
        .lte("shift_start_date", toDate);

    if (shiftError) {
        console.error("[kaipoke_cs_fax_check] shift error", shiftError);
        throw shiftError;
    }

    const shiftRows = (shiftRowsRaw ?? []) as ShiftRow[];
    if (shiftRows.length === 0) {
        return {
            scannedShiftCount: 0,
            scannedClientCount: 0,
            targetClientCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // 2) 対象CS抽出（ユニーク、99999999*除外）
    const csSet = new Set<string>();
    for (const s of shiftRows) {
        const cs = s.kaipoke_cs_id;
        if (!cs) continue;
        if (cs.startsWith("99999999")) continue;
        csSet.add(cs);
    }
    const csIds = Array.from(csSet);

    if (csIds.length === 0) {
        return {
            scannedShiftCount: shiftRows.length,
            scannedClientCount: 0,
            targetClientCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // 3) cs_kaipoke_info を取得（分割）
    //    ✅ service_kind = "要介護" or "要支援" のみに絞る
    const clients: ClientRow[] = [];
    for (const ids of chunk(csIds, 200)) {
        const { data, error } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select("id, kaipoke_cs_id, name, care_consultant, is_active, service_kind")
            .in("kaipoke_cs_id", ids)
            .in("service_kind", ["要介護", "要支援"]);

        if (error) {
            console.error("[kaipoke_cs_fax_check] cs_kaipoke_info error", error);
            throw error;
        }

        for (const row of (data ?? []) as Array<{
            id: string;
            kaipoke_cs_id: string;
            name: string | null;
            care_consultant: string | null;
            is_active: boolean | null;
            service_kind: string | null;
        }>) {
            if (row.is_active === false) continue;

            clients.push({
                id: row.id,
                kaipoke_cs_id: row.kaipoke_cs_id,
                name: row.name ?? null,
                care_consultant: row.care_consultant ?? null,
                is_active: row.is_active ?? null,
            });
        }
    }

    if (clients.length === 0) {
        return {
            scannedShiftCount: shiftRows.length,
            scannedClientCount: 0,
            targetClientCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // 4) 相談支援ID（=fax.id想定）をユニーク化して fax を引く
    const consultantIdSet = new Set<string>();
    for (const c of clients) {
        const id = (c.care_consultant ?? "").trim();
        if (id) consultantIdSet.add(id);
    }
    const consultantIds = Array.from(consultantIdSet);

    const faxMap = new Map<string, FaxRow>();
    for (const ids of chunk(consultantIds, 200)) {
        const { data, error } = await supabaseAdmin
            .from("fax")
            .select("id, fax, email, office_name, service_kind, postal_code")
            .in("id", ids);

        if (error) {
            console.error("[kaipoke_cs_fax_check] fax error", error);
            throw error;
        }

        const rows = (data ?? []) as FaxRow[];
        for (const row of rows) {
            faxMap.set(row.id, {
                id: row.id,
                fax: row.fax,
                email: row.email ?? null,
                office_name: row.office_name ?? null,
                service_kind: row.service_kind ?? null,
                postal_code: row.postal_code ?? null,
            });
        }
    }

    // 5) 対象抽出（未登録 or 連絡先不足）
    type Target =
        | { kind: "no_consultant"; client: ClientRow }
        | {
            kind: "missing_contact";
            client: ClientRow;
            fax: FaxRow | null;
            missingFax: boolean;
            missingEmail: boolean;
        };

    const targets: Target[] = [];

    for (const c of clients) {
        const cc = (c.care_consultant ?? "").trim();
        if (!cc) {
            targets.push({ kind: "no_consultant", client: c });
            continue;
        }

        const fx = faxMap.get(cc) ?? null;

        // care_consultant はあるが fax レコードが無い → データ不整合（未登録扱い）
        if (!fx) {
            targets.push({
                kind: "missing_contact",
                client: c,
                fax: null,
                missingFax: true,
                missingEmail: true,
            });
            continue;
        }

        const faxVal = (fx.fax ?? "").trim();
        const emailVal = (fx.email ?? "").trim();

        const missingFax = !faxVal;
        const missingEmail = !emailVal;

        if (missingFax || missingEmail) {
            targets.push({
                kind: "missing_contact",
                client: c,
                fax: fx,
                missingFax,
                missingEmail,
            });
        }
    }

    if (targets.length === 0) {
        return {
            scannedShiftCount: shiftRows.length,
            scannedClientCount: clients.length,
            targetClientCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // 6) alert_log へ upsert
    let alertsCreated = 0;
    let alertsUpdated = 0;

    for (const t of targets) {
        const c = t.client;

        const message =
            t.kind === "no_consultant"
                ? buildMsgNoConsultant(c)
                : buildMsgMissingContact(c, t.fax, t.missingFax, t.missingEmail);

        const r = await ensureSystemAlert({
            message,
            kaipoke_cs_id: c.kaipoke_cs_id,
            shift_id: null,
            user_id: null,
            rpa_request_id: null,
        });

        if (r.created) alertsCreated += 1;
        else alertsUpdated += 1;
    }

    console.info("[kaipoke_cs_fax_check] done", {
        fromDate,
        toDate,
        scannedShiftCount: shiftRows.length,
        scannedClientCount: clients.length,
        targetClientCount: targets.length,
        alertsCreated,
        alertsUpdated,
    });

    return {
        scannedShiftCount: shiftRows.length,
        scannedClientCount: clients.length,
        targetClientCount: targets.length,
        alertsCreated,
        alertsUpdated,
    };
}

