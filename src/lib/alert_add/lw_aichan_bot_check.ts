// src/lib/alert_add/lw_aichan_bot_check.ts
// LINE WORKS の「利用者様情報連携グループ」に「すまーとアイさん」Bot が登録されていない（channel_id が無い）場合にアラートを出す。
//
// 仕様:
// - group_lw_channel_view のうち
//     group_type = '利用者様情報連携グループ'
//     channel_id IS NULL
//   を対象（= Bot 未登録）
// - ただし「直近±2か月にシフトが無い利用者(kaipoke_cs_id)」は対象外
// - 同じ状態が続く場合の severity は ensureSystemAlert 側の
//   「created_at 起点で2日ごとに +1（最大5）」に従う

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type GroupRow = {
    group_id: string;
    group_name: string | null;
    group_account: string | null;
    group_type: string | null;
    channel_id: string | null;
};

type ClientRow = {
    id: string; // cs_kaipoke_info.id(uuid)
    kaipoke_cs_id: string;
    name: string | null;
};

type ShiftRow = {
    kaipoke_cs_id: string | null;
};

type CsKaipokeInfoRow = {
    id: string;
    kaipoke_cs_id: string;
    name: string | null;
};

export type LwAiChanBotCheckResult = {
    scannedGroupCount: number;
    targetGroupCount: number;
    alertsCreated: number;
    alertsUpdated: number;
    skippedNoCsId: number;
    skippedNoRecentShift: number;
};

function todayJstYmd(): string {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
        new Date(),
    ); // YYYY-MM-DD
}

function addMonthsYmd(ymd: string, months: number): string {
    const [y, m, d] = ymd.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCMonth(dt.getUTCMonth() + months);
    return dt.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function looksLikeKaipokeCsId(text: string | null | undefined): boolean {
    if (!text) return false;
    const t = text.trim();
    // 例: 8桁数字（必要に応じて調整）
    return /^\d{8}$/.test(t);
}

function extractKaipokeCsId(row: GroupRow): string | null {
    // 1) group_account が 8桁ならそれを優先
    if (looksLikeKaipokeCsId(row.group_account)) return row.group_account!.trim();

    // 2) group_name から 8桁を抽出（例: "山田太郎(12345678)" 等）
    const name = (row.group_name ?? "").trim();
    const m = name.match(/(\d{8})/);
    if (m?.[1]) return m[1];

    return null;
}

const CLIENT_DETAIL_BASE_URL =
    "https://myfamille.shi-on.net/portal/kaipoke-info-detail";

function buildAlertMessage(row: GroupRow, csid: string, client?: ClientRow): string {
    const groupLabel = row.group_name ? `「${row.group_name}」` : "（グループ名不明）";
    const clientLabel = client?.id
        ? `<a href="${CLIENT_DETAIL_BASE_URL}/${client.id}">${client.name ?? "利用者"}様</a>`
        : `${client?.name ?? "利用者"}様`;

    // ✅ dedupe の軸として csid を必ず入れる（group_id は出さない）
    return [
        "【LW Bot未登録】",
        `${clientLabel} の利用者様情報連携グループ ${groupLabel}（kaipoke_cs_id=${csid}）に`,
        "「すまーとアイさん」Bot が登録されていません（channel_id 未設定）。",
        "LINE WORKS 側で Bot を追加し、「テスト」など一言コメントを入れてください。",
    ].join(" ");
}


/**
 * LW 連携グループの Bot 未登録チェック
 */
export async function runLwAiChanBotCheck(): Promise<LwAiChanBotCheckResult> {
    console.info("[lw_aichan_bot_check] start");

    // 直近±2か月（= 過去2か月〜未来2か月）にシフトがある利用者のみ対象
    const today = todayJstYmd();
    const fromYmd = addMonthsYmd(today, -2);
    const toYmd = addMonthsYmd(today, 2);

    // 1) Bot未登録グループを取得
    const { data: groupRowsRaw, error: groupError } = await supabaseAdmin
        .from("group_lw_channel_view")
        .select("group_id, group_name, group_account, group_type, channel_id")
        .eq("group_type", "利用者様情報連携グループ")
        .is("channel_id", null);

    if (groupError) {
        console.error("[lw_aichan_bot_check] load group_lw_channel_view error", groupError);
        throw groupError;
    }

    const groups = (groupRowsRaw ?? []) as GroupRow[];
    const scannedGroupCount = groups.length;

    if (groups.length === 0) {
        return {
            scannedGroupCount,
            targetGroupCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
            skippedNoCsId: 0,
            skippedNoRecentShift: 0,
        };
    }

    // 2) 各グループ → kaipoke_cs_id を推定
    const groupWithCs: { row: GroupRow; csid: string }[] = [];
    let skippedNoCsId = 0;

    for (const row of groups) {
        const csid = extractKaipokeCsId(row);
        if (!csid) {
            skippedNoCsId += 1;
            continue;
        }
        // 99999999* は他のチェックと同様に除外
        if (csid.startsWith("99999999")) continue;

        groupWithCs.push({ row, csid });
    }

    if (groupWithCs.length === 0) {
        return {
            scannedGroupCount,
            targetGroupCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
            skippedNoCsId,
            skippedNoRecentShift: 0,
        };
    }

    // 3) 直近±2か月でシフトがある csid を判定（候補csidだけを絞って shift を引く）
    const csids = Array.from(new Set(groupWithCs.map((x) => x.csid)));
    const recentShiftSet = new Set<string>();

    for (const ids of chunk(csids, 200)) {
        const { data, error } = await supabaseAdmin
            .from("shift")
            .select("kaipoke_cs_id")
            .in("kaipoke_cs_id", ids)
            .gte("shift_start_date", fromYmd)
            .lte("shift_start_date", toYmd);

        if (error) {
            console.error("[lw_aichan_bot_check] shift load error", error, {
                fromYmd,
                toYmd,
                chunkSize: ids.length,
            });
            throw error;
        }

        for (const r of (data ?? []) as ShiftRow[]) {
            if (r.kaipoke_cs_id) recentShiftSet.add(r.kaipoke_cs_id);
        }
    }


    const targets = groupWithCs.filter((x) => recentShiftSet.has(x.csid));
    const skippedNoRecentShift = groupWithCs.length - targets.length;

    if (targets.length === 0) {
        return {
            scannedGroupCount,
            targetGroupCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
            skippedNoCsId,
            skippedNoRecentShift,
        };
    }

    // 4) クライアント名/URL用に cs_kaipoke_info を引く
    const clients: ClientRow[] = [];
    for (const ids of chunk(Array.from(new Set(targets.map((x) => x.csid))), 200)) {
        const { data, error } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select("id, kaipoke_cs_id, name")
            .in("kaipoke_cs_id", ids);

        if (error) {
            console.error("[lw_aichan_bot_check] cs_kaipoke_info load error", error);
            throw error;
        }

        for (const r of (data ?? []) as CsKaipokeInfoRow[]) {
            clients.push({
                id: r.id,
                kaipoke_cs_id: r.kaipoke_cs_id,
                name: r.name,
            });
        }
    }
    
    const clientMap = new Map<string, ClientRow>();
    for (const c of clients) clientMap.set(c.kaipoke_cs_id, c);

    let alertsCreated = 0;
    let alertsUpdated = 0;

    for (const t of targets) {
        const client = clientMap.get(t.csid);
        const message = buildAlertMessage(t.row, t.csid, client);

        try {
            const ensured = await ensureSystemAlert({
                message,
                kaipoke_cs_id: t.csid,
                shift_id: null,
                user_id: null,
                rpa_request_id: null,
            });

            if (ensured.created) alertsCreated += 1;
            else alertsUpdated += 1;
        } catch (e) {
            console.error("[lw_aichan_bot_check] ensureSystemAlert error", e, {
                group_id: t.row.group_id,
                kaipoke_cs_id: t.csid,
            });
            // 1件失敗しても継続
        }
    }

    return {
        scannedGroupCount,
        targetGroupCount: targets.length,
        alertsCreated,
        alertsUpdated,
        skippedNoCsId,
        skippedNoRecentShift,
    };
}
