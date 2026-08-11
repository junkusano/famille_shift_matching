import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNEL_ID = "146763225";
function buildReminderMessage(date: string) {
    const teamScoreTestPeriodNote = date <= "2026-09-30"
        ? "\n\n※ 現在、チームスコアはテスト期間です（2026年9月30日まで）。"
        : "";

    return `📣 訪問記録の入力をお願いします

本日実施したサービスの訪問記録は、本日23:43までに完了してください。

23:43時点で訪問記録が未完了の場合、未完了1件につき個人のパフォーマンススコアが5点、所属チームの訪問記録スコアが1点減点されます。

まだ入力していない訪問記録がある方は、忘れずに本日中の入力をお願いします。${teamScoreTestPeriodNote}`;
}

function getJstNow(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return {
        date: `${value("year")}-${value("month")}-${value("day")}`,
        hour: Number(value("hour")),
        minute: Number(value("minute")),
    };
}

export async function GET() {
    const jstNow = getJstNow();
    if (jstNow.hour !== 17 || jstNow.minute !== 43) {
        return NextResponse.json({ ok: true, skipped: true, reason: "17:43 JST 以外の実行" });
    }

    const { data: reservation, error: reservationError } = await supabaseAdmin
        .from("visit_record_daily_reminder_logs")
        .upsert({ reminder_date: jstNow.date }, { onConflict: "reminder_date", ignoreDuplicates: true })
        .select("reminder_date");

    if (reservationError) {
        return NextResponse.json({ ok: false, error: reservationError.message }, { status: 500 });
    }
    if (!reservation || reservation.length === 0) {
        return NextResponse.json({ ok: true, skipped: true, reason: "本日分は送信済み" });
    }

    try {
        const accessToken = await getAccessToken();
        await sendLWBotMessage(CHANNEL_ID, buildReminderMessage(jstNow.date), accessToken);
        const { error: sentAtError } = await supabaseAdmin
            .from("visit_record_daily_reminder_logs")
            .update({ sent_at: new Date().toISOString() })
            .eq("reminder_date", jstNow.date);
        if (sentAtError) throw sentAtError;

        return NextResponse.json({ ok: true, reminder_date: jstNow.date, channel_id: CHANNEL_ID });
    } catch (error) {
        console.error("[visit-record-daily-reminder] LINE WORKS send failed", error);
        return NextResponse.json({ ok: false, error: "LINE WORKS送信に失敗しました" }, { status: 502 });
    }
}
