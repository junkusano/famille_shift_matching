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
    remark: string;
}) {
    const { remark } = args;

    const TEST_TARGET_LW_USERID = "jundakusanoda";

    const { data, error } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select(`
        entry_id,
        user_id,
        channel_id,
        lw_userid,
        last_name_kanji,
        first_name_kanji,
        orgunitname
    `)
        .eq("lw_userid", TEST_TARGET_LW_USERID)
        .maybeSingle();

    if (error) {
        throw new Error(`user_entry_united_view_single select failed: ${error.message}`);
    }

    const staff = (data ?? null) as StaffRow | null;
    if (!staff) {
        throw new Error("対象職員が見つかりません");
    }

    const channelId = String(staff.channel_id ?? "").trim();
    if (!channelId) {
        throw new Error("通知先の channel_id が見つかりません");
    }

    const staffName = buildStaffName(staff) || "対象職員";
    const orgName = String(staff.orgunitname ?? "").trim();

    const accessToken = await getAccessToken();
    const message =
        `【目標設定 追加連絡：テスト送信】\n` +
        `${staffName}さんが目標設定を新しく追加しました。マネージャーはご確認ください。\n\n` +
        `氏名: ${staffName}\n` +
        `チーム: ${orgName || "未設定"}\n` +
        `追加内容:\n${remark}\n\n` +
        `確認画面:\nhttps://myfamille.shi-on.net/portal/training-goals`;

    await sendLWBotMessage(channelId, message, accessToken);

    return {
        ok: true,
        channelId,
        staffName,
    };
}