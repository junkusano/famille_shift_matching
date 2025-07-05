import { getAccessToken } from '@/lib/getAccessToken';
import { sendLWBotMessage } from '@/lib/lineworks/sendLWBotMessage';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseApiKey = process.env.SUPABASE_SERVICE_ROLE!;

const messageText = `【ご協力のお願い】
📣新しい「myfamille（マイファミーユ）」ポータル運用に向けて、個人メールアドレスを教えてください（このグループにコメントしてください）。

「myfamille」では、今後、シフト調整や訪問記録、給与明細などがポータルで確認できるようになる予定です。

💬この投稿に「メールアドレス」をコメントで返信してください（携帯メールやGmailでもOKです）。コメントいただいた後、認証用のメールアドレスをお送りします。

ご協力よろしくお願いいたします🙇‍♀️`;

export async function sendAllBotMessagesFromView() {
    const res = await fetch(`${supabaseUrl}/rest/v1/users_personal_group_view?select=channel_id`, {
        headers: {
            apikey: supabaseApiKey,
            Authorization: `Bearer ${supabaseApiKey}`,
        },
    });

    if (!res.ok) {
        const err = await res.text();
        console.error(`❌ Supabase fetch failed: ${err}`);
        return;
    }

    const data: { channel_id: string; lwuser_id: string }[] = await res.json();
    const sent = new Set<string>();
    const accessToken = await getAccessToken();

    for (const row of data) {
        if (row.channel_id && !sent.has(row.channel_id)) {
            const messageText2 = '<m userId=' + row.lwuser_id + '>さん\n' + messageText;
            await sendLWBotMessage(row.channel_id, messageText2, accessToken);
            sent.add(row.channel_id);
            break; // 1件だけ送って終了
        }
    }
}
