// src/app/api/cron/health-check-reminder/route.ts

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

function getFiscalYearInfo(now = new Date()) {
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const fiscalYear = month >= 4 ? year : year - 1;

    return {
        fiscalYear,
        startDate: `${fiscalYear}-04-01`,
        endDate: `${fiscalYear + 1}-03-31`,
    };
}

export async function GET() {
    try {
        const { fiscalYear, startDate, endDate } = getFiscalYearInfo();

        // テスト送信用：6月でも通知できるように一時的に停止
        //const today = new Date();
        //const notifyStartDate = new Date(`${fiscalYear}-07-01T00:00:00+09:00`);

        // if (today < notifyStartDate) {
        //     return NextResponse.json({
        //         ok: true,
        //         skipped: true,
        //         fiscalYear,
        //         startDate,
        //         endDate,
        //         notifyStartDate: `${fiscalYear}-07-01`,
        //         reason: "7月1日以前のため通知対象外",
        //     });
        // }

        // 1. 健康診断の申請種別IDを取得
        const { data: type, error: typeError } = await supabaseAdmin
            .from("wf_request_type")
            .select("id")
            .eq("code", "health_check")
            .single();

        if (typeError) throw typeError;

        // 2. 提出済みの人を取得
        const { data: submittedRows, error: submittedError } = await supabaseAdmin
            .from("wf_request")
            .select("applicant_user_id,payload")
            .eq("request_type_id", type.id)
            .in("status", ["submitted", "approved", "completed"]);

        if (submittedError) throw submittedError;

        const submittedUserIds = new Set(
            (submittedRows ?? [])
                .filter((r) => {
                    const payload = r.payload as Record<string, unknown> | null;
                    const healthCheckDate = String(payload?.health_check_date ?? "");

                    return healthCheckDate >= startDate && healthCheckDate <= endDate;
                })
                .map((r) => r.applicant_user_id)
        );

        // 3. 対象職員を取得
        const { data: users, error: usersError } = await supabaseAdmin
            .from("user_entry_united_view_single")
            .select("user_id,last_name_kanji,first_name_kanji,channel_id,status,orgunitname")
            .eq("user_id", "saratsubasagunshi")//テスト用
            .neq("status", "removed_from_lineworks_kaipoke");

        if (usersError) throw usersError;

        const notSubmittedUsers = (users ?? []).filter(
            (u) => !submittedUserIds.has(u.user_id)
        );

        // 4. 未提出者へ通知
        const results = [];

        for (const u of notSubmittedUsers) {
            const name = `${u.last_name_kanji ?? ""}${u.first_name_kanji ?? ""}`.trim() || u.user_id;

            if (!u.channel_id) {
                results.push({
                    user_id: u.user_id,
                    ok: false,
                    reason: "channel_idなし",
                });
                continue;
            }

            const message = `【${fiscalYear}年度 健康診断 未提出のお知らせ】

${name} さん

${fiscalYear}年度の健康診断の提出がまだ確認できていません。
対象受診期間：
${startDate} ～ ${fiscalYear + 1}-02-28

精算・申請ページ
https://myfamille.shi-on.net/portal/wf-seisan-shinsei
から「健康診断受診」を選択し、以下を提出してください。

・受診日
・健康診断結果
・領収書（※他社で受けた方は必要ありません。）

すでに提出済みの場合は、ご連絡ください。`;

            try {
                const accessToken = await getAccessToken();
                await sendLWBotMessage(u.channel_id, message, accessToken);

                results.push({
                    user_id: u.user_id,
                    name,
                    ok: true,
                });
            } catch (e) {
                console.error("[health-check-reminder] send error", e);

                results.push({
                    user_id: u.user_id,
                    name,
                    ok: false,
                    reason: e instanceof Error ? e.message : "send error",
                });
            }
        }

        return NextResponse.json({
            ok: true,
            fiscalYear,
            startDate,
            endDate,
            count: notSubmittedUsers.length,
            results,
        });
    } catch (e) {
        console.error(e);
        return NextResponse.json(
            { ok: false, error: e instanceof Error ? e.message : "unknown error" },
            { status: 500 }
        );
    }
}