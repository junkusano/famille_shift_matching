// lib/supabase/analyzeMessages.ts

import OpenAI from 'openai';
import { MsgLwLog } from '@/types/msgLwLog';
import { AnalyzedResult } from '@/types/msgLwAnalyzed';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
});

export async function analyzeMessages(messages: MsgLwLog[]): Promise<AnalyzedResult[]> {
    if (messages.length === 0) return [];

    const prompt = `以下はLINE WORKSグループでのチャットログです。
依頼と思われる投稿に対して、対応されたかどうかを前後の文脈（メンションや返答など）から判定してください。
Bot自身が投稿した通知は除外してください。

※ 次のようなケースでは「対応済み」とみなしてください：
- @メンションで返事されている
- 「了解」「OK」「承知」「確認」「対応します」などのキーワードで反応がある
- 同じChannel内でその話題に返答しているようなやりとりがある
- 返信が 投稿の主語の人に向けた返答だと文脈上明らか な場合
- 依頼・質問への回答文がある場合には、どの依頼なのかを推測してください
- 内容のない発信は無視。依頼文としない。
- 「ありがとう」「承知しました」「がんばります」などで終わっている場合は終了とみなす。

【重要】未対応の依頼が1件もない場合は、JSON形式で "[]"（空の配列）のみを返してください。絶対に解説や文章を含めないでください。

出力形式（必ずJSON配列で）：
[
  {
    "timestamp": "...",
    "channel_id": "...",
    "text": "...",
    "reason": "..."
  }
]`;

    const formattedLogs = messages
        .map((msg) => {
            const sender = msg.channel_id ?? '不明';
            return `${msg.timestamp}｜${sender}：${msg.message}`;
        })
        .join('\n');

    const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: formattedLogs },
        ],
        temperature: 0.2,
    });

    const content = response.choices[0].message.content ?? '';

    try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) throw new Error('出力が配列ではありません');

        // 型チェック付きでマッピング
        const results: AnalyzedResult[] = parsed.map((item) => ({
            timestamp: item.timestamp ?? '',
            channel_id: item.channel_id ?? '',
            text: item.text ?? '',
            reason: item.reason ?? '',
        }));

        return results;
    } catch (err) {
        console.error('❌ OpenAI出力のJSONパースに失敗:', err);
        console.error('出力内容:', content);
        return [];
    }
}