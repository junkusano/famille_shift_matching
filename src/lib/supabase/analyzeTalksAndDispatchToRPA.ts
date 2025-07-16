import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { rpaInstructionPrompt } from "@/lib/supabase/rpaInstructionPrompt";


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const analyzePendingTalksAndDispatch = async () => {
    // ステータス0: 未処理
    const { data: logs, error } = await supabase
        .from("msg_lw_log_with_group_account")
        .select("id, user_id, channel_id, message, timestamp, group_account")
        .eq("status", 0)
        .eq("event_type", "message")
        .neq("message", null)
        .eq("is_numeric_group_account", true) // ← NEW!
        .order("timestamp", { ascending: true });


    console.log("Supabase status fetch error:", error);
    console.log("logs:", logs);

    if (error || !logs?.length) return;

    // ✅ グルーピングキーを channel_id に変更（user_idではない）
    const grouped = logs.reduce(
        (acc: Record<string, { ids: number[]; talks: { role: string; content: string }[] }>, log) => {
            const key = log.channel_id || `user:${log.user_id}`;
            if (!acc[key]) {
                acc[key] = { ids: [], talks: [] };
            }
            acc[key].ids.push(log.id);
            acc[key].talks.push({
                role: "user",
                content: log.message,
            });
            return acc;
        },
        {}
    );

    for (const [channel_id, { ids, talks }] of Object.entries(grouped)) {
        if (!talks.length) continue;

        const baseLog = logs.find((log) => ids.includes(log.id));
        const group_account = baseLog?.group_account || "不明";
        const timestamp = baseLog?.timestamp || new Date().toISOString();

        const messages: ChatCompletionMessageParam[] = [
            rpaInstructionPrompt,
            {
                role: "system",
                content: `この会話は group_account=${group_account} のやりとりです。`,
            },
            {
                role: "system",
                content: `この会話の基準日（最終発言時刻）は ${timestamp} です。`,
            },
            ...talks.map((t) => ({
                role: t.role as "user" | "assistant" | "system",
                content: t.content,
            })),
        ];

        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            temperature: 0,
        });

        const responseText = res.choices[0].message.content?.trim() ?? "";

        console.log("🔍 AI応答内容:", responseText);

        // 分析ログに記録
        await supabase.from("msg_lw_analysis_log").insert({
            timestamp: new Date().toISOString(),
            channel_id: channel_id,
            text: responseText,
            reason: responseText.toLowerCase() === "処理なし" ? "処理不要" : "処理判定済",
        });

        if (responseText.toLowerCase() === "処理なし") {
            await supabase.from("msg_lw_log").update({ status: 2 }).in("id", ids); // 2 = done
            continue;
        }

        try {
            const parsed = JSON.parse(responseText);
            const { template_id, request_detail } = parsed;

            await supabase.from("rpa_command_request").insert({
                template_id,
                request_detail,
                requested_by: null,
                status: "pending",
            });

            await supabase.from("msg_lw_log").update({ status: 3 }).in("id", ids); // 3 = dispatched
        } catch {
            await supabase.from("msg_lw_analysis_log").insert({
                timestamp: new Date().toISOString(),
                channel_id: channel_id,
                text: responseText,
                reason: "JSON parse error",
            });

            await supabase.from("msg_lw_log").update({ status: 4 }).in("id", ids); // 4 = error
        }
    }

};

export default analyzePendingTalksAndDispatch;
