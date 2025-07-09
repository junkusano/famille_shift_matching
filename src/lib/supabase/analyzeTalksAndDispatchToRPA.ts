import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { ChatCompletionMessageParam } from "openai/resources";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzePendingTalksAndDispatch() {
    const { data: logs, error } = await supabase
        .from("msg_lw_log")
        .select("id, user_id, role, content")
        .eq("status", "pending");

    if (error || !logs?.length) return;

    const grouped = logs.reduce(
        (acc: Record<string, { ids: number[]; talks: { role: string; content: string }[] }>, log) => {
            if (!acc[log.user_id]) {
                acc[log.user_id] = { ids: [], talks: [] };
            }
            acc[log.user_id].ids.push(log.id);
            acc[log.user_id].talks.push({ role: log.role, content: log.content });
            return acc;
        },
        {}
    );

    for (const [user_id, { ids, talks }] of Object.entries(grouped)) {
        if (!talks.length) continue;

        const systemPrompt: ChatCompletionMessageParam = {
            role: "system",
            content: `
あなたは会話の流れから、RPAに必要な処理指示を構造化データで抽出するアシスタントです。
以下のどちらかに該当する場合、該当のテンプレートIDを含むJSONで回答してください。

【1. シフト削除】
template_id: "13a881d9-4104-4198-a0a3-3d3e89427472"
request_detailの中には以下を含めてください：
{
  "group_account": "利用者ID（例: A1234）",
  "shift_date": "対象日（例: 2025-07-10）",
  "shift_time": "時間帯（例: 9:00-11:00）"
}

【2. シフト追加】
template_id: "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a"
request_detailの中には以下を含めてください：
{
  "group_account": "利用者ID（例: A1234）",
  "shift_date": "対象日（例: 2025-07-10）",
  "shift_time": "時間帯（例: 9:00-11:00）",
  "user_id": "担当ヘルパーID（例: U5678）"
}

【処理不要の場合】
「処理なし」とだけ返してください。

必ず以下の形式のいずれかで返してください：
- JSON（上記構造）または
- 「処理なし」
`,
        };

        const messages: ChatCompletionMessageParam[] = [
            systemPrompt,
            ...talks.map((t) => ({
                role: t.role as "user" | "assistant" | "system", // 明示的に制約する
                content: t.content,
            })),
        ];

        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            temperature: 0,
        });

        const responseText = res.choices[0].message.content?.trim() ?? "";

        if (responseText.toLowerCase() === "処理なし") {
            await supabase.from("msg_lw_log").update({ status: "done" }).in("id", ids);
            continue;
        }

        try {
            const parsed = JSON.parse(responseText);
            const { template_id, request_detail } = parsed;
            await supabase.from("rpa_command_request").insert({
                template_id,
                request_detail,
                requested_by: user_id,
                status: "pending",
            });
            await supabase.from("msg_lw_log").update({ status: "dispatched" }).in("id", ids);
        } catch (e) {
            await supabase.from("msg_lw_log").update({ status: "error" }).in("id", ids);
        }
    }
}
