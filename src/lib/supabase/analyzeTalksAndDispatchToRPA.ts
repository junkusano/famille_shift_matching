//"C:\Users\USER\famille_shift_matching\src\lib\supabase\analyzeTalksAndDispatchToRPA.ts"

import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { rpaInstructionPrompt } from "@/lib/supabase/rpaInstructionPrompt";
import { getAccessToken } from "@/lib/getAccessToken";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/*
type Log = {
  id: number;
  user_id: string;
  channel_id: string;
  message: string;
  timestamp: string;
  group_account: string;
};
*/

type GroupedTalk = {
    ids: number[];
    talks: { role: "user" | "assistant" | "system"; content: string }[];
};

type GroupMember = {
    externalKey: string;
    id: string;
    type: "USER" | "ORGUNIT" | "GROUP";
};

const analyzePendingTalksAndDispatch = async (): Promise<void> => {
    const { data: logs, error } = await supabase
        .from("msg_lw_log_with_group_account")
        .select("id, user_id, channel_id, message, timestamp, group_account")
        .eq("status", 0)
        .eq("event_type", "message")
        .neq("message", null)
        .eq("is_numeric_group_account", true)
        .order("timestamp", { ascending: true });

    console.log("Supabase status fetch error:", error);
    console.log("logs:", logs);

    if (error || !logs || logs.length === 0) return;

    const grouped: Record<string, GroupedTalk> = logs.reduce((acc, log) => {
        const key = log.channel_id || `user:${log.user_id}`;
        if (!acc[key]) {
            acc[key] = { ids: [], talks: [] };
        }
        acc[key].ids.push(log.id);
        acc[key].talks.push({ role: "user", content: log.message });
        return acc;
    }, {});

    for (const [channel_id, { ids, talks }] of Object.entries(grouped)) {
        if (talks.length === 0) continue;

        const baseLog = logs.find((log) => ids.includes(log.id));
        const group_account = baseLog?.group_account || "不明";
        const timestampUtc = baseLog?.timestamp || new Date().toISOString();
        const jstDate = new Date(timestampUtc);
        jstDate.setHours(jstDate.getHours() + 9);
        const timestamp = jstDate.toISOString().replace("T", " ").replace(".000Z", ""); // 見やすく調整


        const accessToken = await getAccessToken();
        const groupRes = await fetch(`https://www.worksapis.com/v1.0/groups/${channel_id}/members`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        const groupData = await groupRes.json();
        const members: GroupMember[] = groupData.members || [];

        const mentionMap = members
            .filter((m): m is GroupMember & { type: "USER" } => m.type === "USER")
            .map((m) => ({
                name: m.externalKey,
                user_id: m.id,
            }));

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
            {
                role: "system",
                content:
                    `この会話には以下のメンションがあります（JSON形式）。文中に出てくる @名前 に対応する user_id は以下のとおりです。内容に登場する人物の担当者IDを特定する際に必ず参考にしてください。\n` +
                    JSON.stringify(mentionMap, null, 2),
            },
            ...talks.map((t) => ({
                role: t.role,
                content: t.content,
            })),
        ];

        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            temperature: 0,
        });

        const responseText = (res.choices?.[0]?.message?.content ?? "").trim();
        console.log("🔍 AI応答内容:", responseText);

        await supabase.from("msg_lw_analysis_log").insert({
            timestamp: new Date().toISOString(),
            channel_id: channel_id,
            text: responseText,
            reason: responseText.toLowerCase() === "処理なし" ? "処理不要" : "処理判定済",
        });

        if (responseText.trim() === "処理なし") {
            for (const id of ids) {
                const { error: updateErr } = await supabase
                    .from("msg_lw_log")
                    .update({ status: 2 })
                    .eq("id", id);
                if (updateErr) {
                    console.error(`❌ Update failed for id=${id} (status=2):`, updateErr.message);
                }
            }
            continue;
        }

        try {
            let cleanedText = responseText.trim();
            if (cleanedText.startsWith("```") && cleanedText.endsWith("```")) {
                cleanedText = cleanedText.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
            }

            const parsed = JSON.parse(cleanedText);
            const { template_id, request_detail } = parsed;

            const lw_user_id = logs.find((l) => l.id === ids[0])?.user_id ?? null;

            const { data: user } = await supabase
                .from("users")
                .select("auth_user_id")
                .eq("lw_userid", lw_user_id)  // ←正しいカラム名
                .maybeSingle();

            const requestorId = user?.auth_user_id ?? null;

            await supabase.from("rpa_command_requests").insert({
                template_id,
                request_details: request_detail,
                requester_id: requestorId,
                status: "approved",
                requested_at: new Date().toISOString(),
            });

            for (const id of ids) {
                const { error: updateErr } = await supabase
                    .from("msg_lw_log")
                    .update({ status: 9 })
                    .eq("id", id);
                if (updateErr) {
                    console.error(`❌ Update failed for id=${id} (status=3):`, updateErr.message);
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("💥 JSON解析またはInsertエラー:", errorMsg);

            await supabase.from("msg_lw_analysis_log").insert({
                timestamp: new Date().toISOString(),
                channel_id: channel_id,
                text: responseText,
                reason: "JSON parse or insert error",
            });

            for (const id of ids) {
                const { error: updateErr } = await supabase
                    .from("msg_lw_log")
                    .update({ status: 9 })
                    .eq("id", id);
                if (updateErr) {
                    console.error(`❌ Update failed for id=${id} (status=4):`, updateErr.message);
                }
            }
        }
    }
};

export default analyzePendingTalksAndDispatch;
