// src/lib/lineworks/shiftChangeNotify.ts
import { supabaseAdmin } from "@/lib/supabase/service";

/**
 * 送信先（ヘルパーマネジャー固定チャンネル）
 * ※ご指定：Channel_id：99142491
 */
const MANAGER_CHANNEL_ID = "99142491";

type ShiftInfo = {
    shift_id: number | string;
    kaipoke_cs_id: string;
    shift_start_date: string; // YYYY-MM-DD
    shift_start_time: string; // HH:mm:ss 等
    shift_end_time: string | null;
    staff_01_user_id: string | null;
};

export type NotifyShiftChangeArgs = {
    action: "INSERT" | "UPDATE" | "DELETE";
    requestPath: string;
    actorUserIdText: string;
    shift: ShiftInfo;

    /**
     * DELETE時に “削除時点の情報” をメッセージに出したい用（API側で削除前に確保した値）
     */
    deleteChangedCols?: {
        shift_id: number | string;
        kaipoke_cs_id: string;
        shift_start_date: string;
        shift_start_time: string;
        staff_01_user_id: string | null;
    };
};

type LineWorksSendBody = {
    content: {
        type: "text";
        text: string;
    };
};

/**
 * ここは既存の「ShiftRecords.tsx の送信実装」を踏襲する想定。
 * あなたの環境の送信関数名/署名に合わせて、fetch部分だけ差し替えてください。
 *
 * もし既に別ファイルに「LINE WORKSへ送る共通関数」があるなら、
 * ここでそれを import して使うのがベストです。
 */
async function sendLineWorksMessage(channelId: string, text: string): Promise<void> {
    void channelId;
    // TODO: ShiftRecords.tsx と同じ送信方式に合わせる
    // 例）JWT生成して worksapis へPOST …など
    //
    // ここが未実装だと「通知は動かない」けど「ビルドは通る」状態になります。
    // すぐ動かすなら、ShiftRecords.tsx の送信処理をここにコピペしてください。
    const body: LineWorksSendBody = { content: { type: "text", text } };
    void body;

    throw new Error("sendLineWorksMessage is not implemented. Copy the send logic from ShiftRecords.tsx.");
}

function buildText(args: NotifyShiftChangeArgs, csName: string, clientChannelId: string | null) {
    const s = args.shift;
    const del = args.deleteChangedCols;

    // mention：部屋にいない場合はテキストでIDを打つ方針 → “@id” を文字として入れる
    const mentionText = s.staff_01_user_id ? `@${s.staff_01_user_id}` : "";

    const header = "直近シフトがマネジャーによって変更されました。内容：";
    const lines: string[] = [
        header,
        `利用者：${csName}（${s.kaipoke_cs_id}）`,
        `開始：${s.shift_start_date} ${s.shift_start_time}`,
        `担当：${mentionText || "(担当者なし)"}`,
        `操作：${args.action}`,
        `画面：${args.requestPath}`,
        clientChannelId ? `送付先：利用者部屋(${clientChannelId}) / マネジャー(${MANAGER_CHANNEL_ID})` : `送付先：マネジャー(${MANAGER_CHANNEL_ID})`,
    ];

    // DELETE時は “削除時点の情報” を追記
    if (args.action === "DELETE" && del) {
        lines.push("----");
        lines.push("削除時点：");
        lines.push(`開始：${del.shift_start_date} ${del.shift_start_time}`);
        lines.push(`担当：${del.staff_01_user_id ? `@${del.staff_01_user_id}` : "(担当者なし)"}`);
    }

    return lines.join("\n");
}

/**
 * ✅ これが route.ts から import される本体
 */
export async function notifyShiftChange(args: NotifyShiftChangeArgs): Promise<void> {
    // 1) 利用者名（cs_kaipoke_info.name）取得
    const { data: cs, error: csErr } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("name, kaipoke_cs_id")
        .eq("kaipoke_cs_id", args.shift.kaipoke_cs_id)
        .maybeSingle();

    if (csErr) throw csErr;
    const csName = cs?.name ?? "(利用者名不明)";

    // 2) 利用者部屋 channel_id 逆引き
    // 指定：
    // cs_kaipoke_info.kaipoke_cs_id = group_lw_channel_view.group_account - channel_id
    const { data: ch, error: chErr } = await supabaseAdmin
        .from("group_lw_channel_view")
        .select("channel_id")
        .eq("group_account", args.shift.kaipoke_cs_id)
        .maybeSingle();

    if (chErr) throw chErr;
    const clientChannelId: string | null = ch?.channel_id ? String(ch.channel_id) : null;

    // 3) メッセージ生成
    const text = buildText(args, csName, clientChannelId);

    // 4) 送信：利用者部屋（あれば）＋マネジャー固定
    // ※送信失敗してもAPI本体を失敗にしたくない方針なら、呼び出し元で try/catch 済みなのでOK
    if (clientChannelId) {
        await sendLineWorksMessage(clientChannelId, text);
    }
    await sendLineWorksMessage(MANAGER_CHANNEL_ID, text);
}
