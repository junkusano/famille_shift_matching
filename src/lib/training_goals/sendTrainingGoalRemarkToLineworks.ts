import { supabaseAdmin } from "@/lib/supabase/service";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";

type StaffRow = {
    entry_id: string | null;
    user_id: string | null;
    channel_id: string | null;
    lw_userid: string | null;
    last_name_kanji: string | null;
    first_name_kanji: string | null;
    orgunitname: string | null;
};

function buildStaffName(row?: StaffRow | null) {
    if (!row) return "";
    return `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim();
}

export async function sendTrainingGoalRemarkToLineworks(args: {
    entryId: string;
    remark?: string;
    notifyType?: "remark" | "selected" | "watched";
    goalTitle?: string;
    trainingGoal?: string | null;
}) {
    const {
        entryId,
        remark = "",
        notifyType = "remark",
        goalTitle = "",
        trainingGoal = null,
    } = args;

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single_career")
        .select(`
        entry_id,
        user_id,
        channel_id,
        lw_userid,
        last_name_kanji,
        first_name_kanji,
        orgunitname
    `)
        .eq("entry_id", entryId)
        .maybeSingle();

    if (error) {
        throw new Error(`user_entry_united_view_single select failed: ${error.message}`);
    }

    const staff = (data ?? null) as StaffRow | null;
    if (!staff) {
        throw new Error("対象職員が見つかりません");
    }
    const to =
        staff.channel_id ??   // 勤務キャリア・コーディネートルーム
        staff.lw_userid;      // fallback（個人チャット）

    if (!to) {
        throw new Error("送信先が見つかりません");
    }

    const staffName = buildStaffName(staff) || "対象職員";
    const orgName = String(staff.orgunitname ?? "").trim();

    const accessToken = await getAccessToken();
    const title =
        notifyType === "selected"
            ? "【目標設定 追加連絡】"
            : notifyType === "watched"
                ? "【研修受講完了 連絡】"
                : "【目標設定 備考追加連絡】";

    const mainText =
        notifyType === "selected"
            ? `${staffName}さんに目標が設定されました。マネージャーはご確認ください。`
            : notifyType === "watched"
                ? `${staffName}さんが研修受講完了にチェックしました。マネージャーはご確認ください。`
                : `${staffName}さんが新しい目標設定を希望しています。マネージャーはご確認ください。`;

    const detailText =
        notifyType === "remark"
            ? `追加内容:\n${remark}`
            : `目標:\n${goalTitle || "未設定"}\n\n目標内容:\n${trainingGoal || "未設定"}`;

    const message =
        `${title}\n` +
        `${mainText}\n\n` +
        `氏名: ${staffName}\n` +
        `チーム: ${orgName || "未設定"}\n` +
        `${detailText}\n\n` +
        `確認画面:\nhttps://myfamille.shi-on.net/portal/training-goals`;
    await sendLWBotMessage(to, message, accessToken);

    return {
        ok: true,
        to,
        staffName,
    };
}