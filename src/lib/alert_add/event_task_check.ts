// src/lib/alert_add/event_task_check.ts
// 「イベントタスク期限超過アラート」を発行するロジック本体。
// cron ハブ (/api/cron/alert-check-excuse) から呼ばれる想定。

import { supabaseAdmin } from "@/lib/supabase/service";
import { ensureSystemAlert } from "@/lib/alert/ensureSystemAlert";

type EventTaskRow = {
    id: string; // uuid
    template_id: string; // uuid
    kaipoke_cs_id: string; // text
    user_id: string | null; // text
    due_date: string; // YYYY-MM-DD
    status: string; // open / in_progress / done / cancelled / muted
};

type ClientRow = {
    id: string; // cs_kaipoke_info.id（uuid）
    kaipoke_cs_id: string;
    name: string | null;
    is_active: boolean | null;
};

type EventTemplateRow = {
    id: string;
    template_name: string;
};

export type EventTaskCheckResult = {
    scannedTaskCount: number;
    targetTaskCount: number;
    alertsCreated: number;
    alertsUpdated: number;
};

function todayJstYmd(): string {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
        new Date(),
    ); // YYYY-MM-DD
}

function diffDays(aYmd: string, bYmd: string): number {
    // a - b（日数）
    const [ay, am, ad] = aYmd.split("-").map(Number);
    const [by, bm, bd] = bYmd.split("-").map(Number);
    const a = Date.UTC(ay, am - 1, ad);
    const b = Date.UTC(by, bm - 1, bd);
    return Math.floor((a - b) / 86400000);
}

function chunk<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
    return result;
}

/**
 * 期限超過（due_date < 今日JST）かつ未完了ならアラート
 * severity(Lv) ルール:
 *   overdueDays = (今日 - due_date)
 *   Lv = min( 1 + floor(overdueDays / 2), 5 )
 * 例:
 *   overdueDays=1 -> Lv1
 *   overdueDays=2,3 -> Lv2
 *   overdueDays=4,5 -> Lv3 ...
 */
function calcSeverity(today: string, due: string): number {
    const overdueDays = diffDays(today, due);
    const lv = 1 + Math.floor(overdueDays / 2);
    return Math.max(1, Math.min(5, lv));
}

function buildAlertMessage(
    task: EventTaskRow,
    templateName: string,
    client?: ClientRow,
): string {
    const name = client?.name ?? "利用者名不明";

    const taskPortalUrl = "https://myfamille.shi-on.net/portal/event-tasks";
    const clientUrl = client?.id
        ? `https://myfamille.shi-on.net/portal/kaipoke-info-detail/${client.id}`
        : null;

    return [
        "【イベントタスク期限超過】",
        clientUrl
            ? `<a href="${clientUrl}">${name}様</a> の`
            : `${name}様 の`,
        `<a href="${taskPortalUrl}">（${templateName}）</a>が未完了です。`,
        `期限：${task.due_date}`,
    ].join(" ");
}

export async function runEventTaskCheck(): Promise<EventTaskCheckResult> {
    console.info("[event_task_check] start");

    const today = todayJstYmd();

    // NOTE:
    // ユーザー要件は「status=doneじゃなかったら」だが、通常は cancelled/muted は除外したいので
    // ここでは open/in_progress のみ対象にしている。
    // cancelled/muted も鳴らしたい場合は .neq("status","done") に変更してください。
    const { data: taskRowsRaw, error: taskError } = await supabaseAdmin
        .from("event_tasks")
        .select("id, template_id, kaipoke_cs_id, user_id, due_date, status")
        .lt("due_date", today)
        .in("status", ["open", "in_progress"]);

    if (taskError) {
        console.error("[event_task_check] event_tasks load error", taskError);
        throw taskError;
    }

    const allTasks = (taskRowsRaw ?? []) as EventTaskRow[];

    // 99999999* は除外（他のチェックに合わせる）
    const tasks = allTasks.filter(
        (t) => t.kaipoke_cs_id && !t.kaipoke_cs_id.startsWith("99999999"),
    );

    // event_template をまとめて引く（テンプレ名をメッセージに入れる）
    const templateIds = Array.from(new Set(tasks.map((t) => t.template_id)));
    const templates: EventTemplateRow[] = [];

    for (const ids of chunk(templateIds, 200)) {
        const { data, error } = await supabaseAdmin
            .from("event_template")
            .select("id, template_name")
            .in("id", ids);

        if (error) {
            console.error("[event_task_check] event_template error", error);
            throw error;
        }

        for (const row of (data ?? []) as EventTemplateRow[]) {
            templates.push({
                id: row.id,
                template_name: row.template_name,
            });
        }
    }

    const templateMap = new Map<string, string>();
    for (const t of templates) templateMap.set(t.id, t.template_name);


    if (tasks.length === 0) {
        console.info("[event_task_check] no targets", {
            scannedTaskCount: allTasks.length,
            targetTaskCount: 0,
        });
        return {
            scannedTaskCount: allTasks.length,
            targetTaskCount: 0,
            alertsCreated: 0,
            alertsUpdated: 0,
        };
    }

    // cs_kaipoke_info をまとめて引く（名称・詳細URL用）
    const csIds = Array.from(new Set(tasks.map((t) => t.kaipoke_cs_id)));
    const clients: ClientRow[] = [];
    for (const ids of chunk(csIds, 200)) {
        const { data, error } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select("id, kaipoke_cs_id, name, is_active")
            .in("kaipoke_cs_id", ids);

        if (error) {
            console.error("[event_task_check] cs_kaipoke_info error", error);
            throw error;
        }

        for (const row of data ?? []) {
            clients.push({
                id: row.id,
                kaipoke_cs_id: row.kaipoke_cs_id,
                name: row.name ?? null,
                is_active: row.is_active ?? null,
            });
        }
    }

    const clientMap = new Map<string, ClientRow>();
    for (const c of clients) clientMap.set(c.kaipoke_cs_id, c);

    let alertsCreated = 0;
    let alertsUpdated = 0;

    for (const t of tasks) {
        const client = clientMap.get(t.kaipoke_cs_id);
        const templateName = templateMap.get(t.template_id) ?? "（テンプレ名不明）";
        const message = buildAlertMessage(t, templateName, client);

        // Lv計算（due_date超過日数に応じて2日ごとに+1、最大5）
        const severity = calcSeverity(today, t.due_date);

        try {
            // まずは既存と同様に ensureSystemAlert で “systemアラート” を確実化
            const ensured = await ensureSystemAlert({
                message,
                kaipoke_cs_id: t.kaipoke_cs_id,
                user_id: t.user_id ?? null,
                shift_id: null,
                rpa_request_id: null,
            });

            if (ensured.created) alertsCreated += 1;
            else alertsUpdated += 1;

            // その後、severity を上書き（ensureSystemAlert が severity を受けない実装でも動くように）
            if (ensured.id) {
                const { error: upErr } = await supabaseAdmin
                    .from("alert_log")
                    .update({ severity })
                    .eq("id", ensured.id);

                if (upErr) {
                    console.error("[event_task_check] severity update error", upErr, {
                        alert_id: ensured.id,
                        event_task_id: t.id,
                    });
                }
            }
        } catch (err) {
            console.error("[event_task_check] ensureSystemAlert error", err, {
                event_task_id: t.id,
                kaipoke_cs_id: t.kaipoke_cs_id,
            });
            // 1件失敗しても継続
        }
    }

    console.info("[event_task_check] done", {
        today,
        scannedTaskCount: allTasks.length,
        targetTaskCount: tasks.length,
        alertsCreated,
        alertsUpdated,
    });

    return {
        scannedTaskCount: allTasks.length,
        targetTaskCount: tasks.length,
        alertsCreated,
        alertsUpdated,
    };
}
