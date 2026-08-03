// src/app/api/cron/training-goal-reminder/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { getAccessToken } from "@/lib/getAccessToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type EmployeeRow = {
    entry_id: string | null;
    user_id: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    channel_id: string | null;
    status: string | null;
    orgunitname: string | null;
};

type CompletedTrainingRow = {
    entry_id: string | null;
};

function getFiscalYearInfo(now = new Date()) {
    // Vercel等の実行環境がUTCでも日本時間の年度を判定できるようにする
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth() + 1;
    const fiscalYear = month >= 4 ? year : year - 1;

    return {
        fiscalYear,
        startDate: `${fiscalYear}-04-01`,
        endDate: `${fiscalYear + 1}-03-31`,
        startAt: `${fiscalYear}-04-01T00:00:00+09:00`,
        nextStartAt: `${fiscalYear + 1}-04-01T00:00:00+09:00`,
        notifyStartAt: `${fiscalYear}-07-01T00:00:00+09:00`,
    };
}

export async function GET() {
    try {
        const {
            fiscalYear,
            startDate,
            endDate,
            startAt,
            nextStartAt,
            notifyStartAt,
        } = getFiscalYearInfo();

        // 健康診断アラートと同じく、年度開始直後ではなく7月1日から通知する
        const now = new Date();
        const notifyStartDate = new Date(notifyStartAt);

        if (now < notifyStartDate) {
            return NextResponse.json({
                ok: true,
                skipped: true,
                fiscalYear,
                startDate,
                endDate,
                notifyStartDate: `${fiscalYear}-07-01`,
                reason: "7月1日以前のため通知対象外",
            });
        }

        // 1. 当年度中に一度でも受講完了した職員を取得
        // watched_atは使用せず、既存データのupdated_atを年度判定に使う
        const { data: completedRows, error: completedError } =
            await supabaseAdmin
                .from("employee_training_goals")
                .select("entry_id")
                .eq("row_type", "goal")
                .eq("watched", true)
                .gte("updated_at", startAt)
                .lt("updated_at", nextStartAt);

        if (completedError) throw completedError;

        const completedEntryIds = new Set(
            ((completedRows ?? []) as CompletedTrainingRow[])
                .map((row) => row.entry_id)
                .filter((entryId): entryId is string => Boolean(entryId))
        );

        // 2. 健康診断アラートと同じ対象職員を取得
        const { data: users, error: usersError } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select(
                "entry_id,user_id,last_name_kanji,first_name_kanji,channel_id,status,orgunitname"
            )
            .eq("user_id", "saratsubasagunshi") // テスト送信用
            .neq("status", "removed_from_lineworks_kaipoke");

        if (usersError) throw usersError;

        // view内で同じentry_idが複数行になる場合に備えて重複を除外
        const uniqueUsers = new Map<string, EmployeeRow>();

        for (const user of (users ?? []) as EmployeeRow[]) {
            if (!user.entry_id) continue;

            const current = uniqueUsers.get(user.entry_id);

            if (!current) {
                uniqueUsers.set(user.entry_id, user);
                continue;
            }

            // 管理者直属チームと実所属が重複する場合は実所属を優先
            if (
                current.orgunitname === "管理者直属チーム" &&
                user.orgunitname !== "管理者直属チーム"
            ) {
                uniqueUsers.set(user.entry_id, user);
            }
        }

        const notCompletedUsers = Array.from(uniqueUsers.values()).filter(
            (user) =>
                Boolean(user.entry_id) &&
                !completedEntryIds.has(user.entry_id as string)
        );

        // 3. 未実施者へLINE WORKS通知
        const results: Array<{
            entry_id: string | null;
            user_id: string | null;
            name?: string;
            ok: boolean;
            reason?: string;
        }> = [];

        // アクセストークンは1回のCron実行につき1度だけ取得する
        const accessToken = await getAccessToken();

        for (const user of notCompletedUsers) {
            const name =
                `${user.last_name_kanji ?? ""}${user.first_name_kanji ?? ""}`.trim() ||
                user.user_id ||
                "職員";

            if (!user.channel_id) {
                results.push({
                    entry_id: user.entry_id,
                    user_id: user.user_id,
                    name,
                    ok: false,
                    reason: "channel_idなし",
                });
                continue;
            }

            const message = `【${fiscalYear}年度 目標・研修 未実施のお知らせ】

${name} さん

${fiscalYear}年度の目標・研修について、年度内の受講完了がまだ確認できていません。
対象年度：${startDate} ～ ${endDate}

Myファミーユの「目標・研修」ページを開き、対象の研修を確認・受講したうえで、「研修受講完了」にチェックを入れてください。

すでに実施済みの場合は、目標・研修ページの登録状況をご確認ください。`;

            try {
                await sendLWBotMessage(user.channel_id, message, accessToken);

                results.push({
                    entry_id: user.entry_id,
                    user_id: user.user_id,
                    name,
                    ok: true,
                });
            } catch (error) {
                console.error("[training-goal-reminder] send error", {
                    entry_id: user.entry_id,
                    user_id: user.user_id,
                    error,
                });

                results.push({
                    entry_id: user.entry_id,
                    user_id: user.user_id,
                    name,
                    ok: false,
                    reason:
                        error instanceof Error ? error.message : "send error",
                });
            }
        }

        const sentCount = results.filter((result) => result.ok).length;
        const failedCount = results.length - sentCount;

        return NextResponse.json({
            ok: true,
            fiscalYear,
            startDate,
            endDate,
            completedCount: completedEntryIds.size,
            targetCount: uniqueUsers.size,
            reminderCount: notCompletedUsers.length,
            sentCount,
            failedCount,
            results,
        });
    } catch (error) {
        console.error("[training-goal-reminder] error", error);

        return NextResponse.json(
            {
                ok: false,
                error:
                    error instanceof Error ? error.message : "unknown error",
            },
            { status: 500 }
        );
    }
}