import { createClient } from '@supabase/supabase-js';
import { MsgLwLog } from '@/types/msgLwLog';

// 型定義
interface TalkMessage {
    id: string;
    content: string;
    postedAt: string;
    userId: string;
    roomId: string;
    roomName?: string;
}

interface RpaRequestDetails {
    source: string;             // 例: "LINE WORKS自動抽出"
    originalText: string;       // 元の投稿文
    reason?: string;            // オプション: キャンセル理由など
    note?: string;              // オプション: 備考など
}

interface RpaCommandRequest {
    label: string;
    requested_date: string;
    request_type: string;
    requester_id: string;
    request_details: RpaRequestDetails;
    status?: string;
}
interface MessageRow {
    id: number;
    message: string;
    timestamp: string; // ISO形式文字列
    user_id: string;
    channel_id: string;
}

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export enum MessageStatus {
    未判定 = 0,
    保留 = 1,
    一次処理終了 = 2,
    完了 = 9,
}

// メイン関数
export async function analyzeTalksAndDispatchToRPA() {
    const messages = await fetchRecentMessagesFromTalkRooms();
    const commands = await analyzeTalkMessages(messages);
    const unique = await removeAlreadyRegistered(commands);

    if (unique.length > 0) {
        await insertRpaCommandRequests(unique);
    }

    const handledIds = messages.map((m) => m.id);
    await markMessagesAsProcessed(handledIds);
}

// 1. トーク抽出（過去20分）
async function fetchRecentMessagesFromTalkRooms(): Promise<TalkMessage[]> {
    const since = new Date(Date.now() - 1000 * 60 * 20).toISOString();

    const { data, error } = await supabase
        .from('msg_lw_log')
        .select('*')
        .eq('status', MessageStatus.未判定)
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('トーク取得失敗:', error);
        return [];
    }

    return (data as MsgLwLog[]).map((row) => ({
        id: String(row.id),
        content: row.message,
        postedAt: row.timestamp,
        userId: row.user_id,
        roomId: row.channel_id,
    }));

}

// 2. トーク分析 → RPAコマンド化
async function analyzeTalkMessages(messages: TalkMessage[]): Promise<RpaCommandRequest[]> {
    const results: RpaCommandRequest[] = [];

    for (const msg of messages) {
        const cmds: (Partial<RpaCommandRequest> | null)[] = [
            detectShiftDelete(msg),
            detectTimeChange(msg),
            detectShiftChange(msg),
        ];

        for (const cmd of cmds) {
            if (cmd?.label && cmd?.requested_date) {
                results.push({
                    ...cmd,
                    request_type: cmd.request_type || '未定義',
                    requester_id: msg.userId,
                    request_details: {
                        source: 'LINE WORKS自動抽出',
                        originalText: msg.content,
                    },
                    status: 'pending',
                } as RpaCommandRequest);
            }
        }
    }
    return results;
}

// 3. シフト削除検出
function detectShiftDelete(msg: TalkMessage): Partial<RpaCommandRequest> | null {
    const text = msg.content;
    if (/キャンセル|削除|行けなく|中止/i.test(text)) {
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\s*(朝|昼|夕|夜|\d{1,2}[:時]))?/);
        const userIdMatch = text.match(/\b\d{6,10}\b/);

        if (dateMatch && userIdMatch) {
            const month = dateMatch[1].padStart(2, '0');
            const day = dateMatch[2].padStart(2, '0');
            const timeText = dateMatch[3] || '08:00';
            const time = timeTextToTime(timeText);

            const now = new Date();
            const year = now.getFullYear();
            const iso = `${year}-${month}-${day}T${time}:00`;

            return {
                label: userIdMatch[0],
                requested_date: iso,
                request_type: '削除',
            };
        }
    }
    return null;
}

// 4. シフト時間変更（stub）
function detectTimeChange(_: TalkMessage): null {
    return null;
}

// 5. シフト担当変更（stub）
function detectShiftChange(_: TalkMessage): null {
    return null;
}

// 6. 時間テキスト→24h形式に変換
function timeTextToTime(input: string): string {
    if (input.includes('朝')) return '08:00';
    if (input.includes('昼')) return '12:00';
    if (input.includes('夕') || input.includes('夜')) return '18:00';
    const hm = input.match(/(\d{1,2})[:時](\d{0,2})?/);
    if (hm) {
        const h = hm[1].padStart(2, '0');
        const m = (hm[2] || '00').padStart(2, '0');
        return `${h}:${m}`;
    }
    return '08:00';
}

// 7. 重複除外
async function removeAlreadyRegistered(commands: RpaCommandRequest[]): Promise<RpaCommandRequest[]> {
    const results: RpaCommandRequest[] = [];

    for (const cmd of commands) {
        const { data } = await supabase
            .from('rpa_command_requests')
            .select('id')
            .eq('label', cmd.label)
            .eq('requested_date', cmd.requested_date)
            .eq('request_type', cmd.request_type)
            .maybeSingle();

        if (!data) results.push(cmd);
    }

    return results;
}

// 8. Supabaseへ登録
async function insertRpaCommandRequests(commands: RpaCommandRequest[]): Promise<void> {
    const { error } = await supabase.from('rpa_command_requests').insert(commands);
    if (error) console.error('RPA登録失敗:', error);
}

// 9. 元のメッセージに処理済みフラグを設定
async function markMessagesAsProcessed(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;

    const { error } = await supabase
        .from('msg_lw_log')
        .update({ status: MessageStatus.一次処理終了 })
        .in('id', messageIds);

    if (error) console.error('msg_lw_log 更新失敗:', error);
}