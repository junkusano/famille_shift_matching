// src/lib/alert_add/disability_check_unsubmitted_alert.ts
// disability_check の提出未チェック → LINEWORKS通知のみ
// disability_check の回収未チェック → 15日以降のみHPアラート（manager向け）

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert"; // ★追加

type DisabilityCheckRow = {
    id: string;
    kaipoke_cs_id: string;
    kaipoke_servicek: "障害" | "移動支援";
    year_month: string; // 'YYYY-MM'
    is_checked: boolean; // 回収
    asigned_jisseki_staff: string | null; // 実績記録者
    application_check: boolean | null; // 提出
};

// ★戻り値を拡張（HPアラート作成件数を追加）
export type DisabilityCheckDailyAlertResult = {
    submitted: {
        scanned: number;
        notified: number;
        errors: number;
        dryRun: boolean;
        targetYearMonths: { from: string; to: string };
    };
    collected: {
        scanned: number;
        created: number;
        updated: number;
        skippedBecauseDay: boolean;
        targetYearMonth: string;
    };
};

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function ymMinusMonths(base: Date, monthsBack: number): string {
    const d = new Date(base.getFullYear(), base.getMonth(), 1);
    d.setMonth(d.getMonth() - monthsBack);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function ymNow(base: Date): string {
    return `${base.getFullYear()}-${pad2(base.getMonth() + 1)}`;
}

/**
 * LINEWORKSへテキスト送信（既存のまま）
 */
async function sendLineworksTextMessage(text: string): Promise<void> {
    const accessToken = process.env.LINEWORKS_BOT_ACCESS_TOKEN;
    const botNo = process.env.LINEWORKS_BOT_NO;
    const roomId = process.env.LINEWORKS_ROOM_ID;

    if (!accessToken || !botNo || !roomId) {
        throw new Error(
            "LINEWORKS env missing: require LINEWORKS_BOT_ACCESS_TOKEN, LINEWORKS_BOT_NO, LINEWORKS_ROOM_ID",
        );
    }

    const url = `https://www.worksapis.com/v1.0/bots/${encodeURIComponent(
        botNo,
    )}/rooms/${encodeURIComponent(roomId)}/messages`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content: { type: "text", text },
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `LINEWORKS send failed: ${res.status} ${res.statusText} body=${body}`,
        );
    }
}

/**
 * A) 提出（application_check）未チェック → LINEWORKSのみ
 * ここは「HPアラートは絶対に作らない」ので、ensureSystemAlert は呼びません。
 */
async function runSubmittedUncheckLineworksOnly(
    args: { dryRun: boolean },
) {
    const now = new Date();
    const toYm = ymNow(now);
    const fromYm = ymMinusMonths(now, 2);

    const { data, error } = await supabaseAdmin
        .from("disability_check")
        .select(
            "id, kaipoke_cs_id, kaipoke_servicek, year_month, is_checked, asigned_jisseki_staff, application_check",
        )
        .gte("year_month", fromYm)
        .lte("year_month", toYm)
        .or("application_check.is.null,application_check.eq.false");

    if (error) {
        throw new Error(`disability_check select failed: ${error.message}`);
    }

    const rows = (data ?? []) as DisabilityCheckRow[];

    if (!rows.length) {
        return {
            scanned: 0,
            notified: 0,
            errors: 0,
            dryRun: args.dryRun,
            targetYearMonths: { from: fromYm, to: toYm },
        };
    }

    const lines: string[] = [];
    for (const r of rows) {
        const staff = r.asigned_jisseki_staff ? ` 担当:${r.asigned_jisseki_staff}` : "";
        lines.push(`・${r.year_month} ${r.kaipoke_servicek} CS:${r.kaipoke_cs_id}${staff}`);
    }

    const message =
        [
            "【提出未チェックアラート】disability_check で「提出」が未チェックのデータがあります。",
            `対象月: ${fromYm} 〜 ${toYm}`,
            "",
            ...lines,
        ].join("\n");

    let notified = 0;
    let errorsCount = 0;

    if (!args.dryRun) {
        try {
            await sendLineworksTextMessage(message);
            notified = 1;
        } catch (e) {
            errorsCount++;
            console.error("[disability_check_submitted] LINEWORKS send error", e);
        }
    }

    return {
        scanned: rows.length,
        notified,
        errors: errorsCount,
        dryRun: args.dryRun,
        targetYearMonths: { from: fromYm, to: toYm },
    };
}

/**
 * B) 回収（is_checked）未チェック → 毎月15日以降ならHPアラートを作成
 * 対象：本来は「実績記録者の所属チームのチームマネージャー」
 * ※ここでは shift_record_unfinished_check と同様に visible_roles=["manager"] で作成し、
 *   message に担当者名を含めてマネージャーが判断できる形にします。
 */
async function runCollectedUncheckHpAlertOnly(): Promise<{
    scanned: number;
    created: number;
    updated: number;
    skippedBecauseDay: boolean;
    targetYearMonth: string;
}> {
    const now = new Date();
    const day = now.getDate();

    const targetYm = ymNow(now);

    // 15日未満は何もしない（アラートを出さない）
    if (day < 15) {
        return {
            scanned: 0,
            created: 0,
            updated: 0,
            skippedBecauseDay: true,
            targetYearMonth: targetYm,
        };
    }

    const { data, error } = await supabaseAdmin
        .from("disability_check")
        .select(
            "id, kaipoke_cs_id, kaipoke_servicek, year_month, is_checked, asigned_jisseki_staff, application_check",
        )
        .eq("year_month", targetYm)
        .eq("is_checked", false);

    if (error) {
        throw new Error(`disability_check select failed: ${error.message}`);
    }

    const rows = (data ?? []) as DisabilityCheckRow[];

    if (!rows.length) {
        return {
            scanned: 0,
            created: 0,
            updated: 0,
            skippedBecauseDay: false,
            targetYearMonth: targetYm,
        };
    }

    let created = 0;
    let updated = 0;

    for (const r of rows) {
        const staff = r.asigned_jisseki_staff ?? "（担当未設定）";

        // HPアラート文言（AlertBarがHTMLを描画できる前提ならリンクも入れられます）
        // 今回はリンク先が不明なので、まずはテキストだけにしています。
        const message =
            `【回収未チェック】${r.year_month} ${r.kaipoke_servicek} CS:${r.kaipoke_cs_id} / 実績記録者:${staff} の回収チェックが未完了です。`;

        // ensureSystemAlert の dedupe 用に shift_id を使っているため、
        // disability_check の id を文字列で流用して重複作成を防ぎます。
        const res = await ensureSystemAlert({
            message,
            visible_roles: ["manager"], // ★マネージャ向け（スタッフには出さない）
            kaipoke_cs_id: r.kaipoke_cs_id,
            shift_id: `disability_check:${r.id}`, // ★重複防止キーとして流用
        });

        if (res.created) created++;
        else updated++;
    }

    return {
        scanned: rows.length,
        created,
        updated,
        skippedBecauseDay: false,
        targetYearMonth: targetYm,
    };
}

/**
 * ★cronから呼ぶ統合関数（1日1回でA+Bを回す）
 */
export async function runDisabilityCheckDailyAlerts(
    args: { dryRun: boolean } = { dryRun: false },
): Promise<DisabilityCheckDailyAlertResult> {
    const submitted = await runSubmittedUncheckLineworksOnly(args);
    const collected = await runCollectedUncheckHpAlertOnly();

    return { submitted, collected };
}
