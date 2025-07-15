import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const analyzePendingTalksAndDispatch = async () => {
  // ステータス0: 未処理
  const { data: logs, error } = await supabase
    .from("msg_lw_log")
    .select("id, user_id, role, content")
    .eq("status", 0);

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
ただし、削除対象となるのは「サービス自体がキャンセルされた場合（利用者またはケアマネ等からの連絡による中止）」に限ります。
発信者が「自分のシフトに行けない」「対応できない」などの理由で依頼している場合は、削除対象外としてください。
（その場合は「処理なし」としてください）

【1. シフト削除】
template_id: "13a881d9-4104-4198-a0a3-3d3e89427472"
request_detailの中には以下を含めてください：
{
  "group_account": "利用者ID（例: A1234）",
  "shift_date": "対象日（例: 2025-07-10）",
  "shift_time": "時間帯（例: 9:00-11:00）"
}



【2. シフト追加】
以下のような会話の場合に該当します：
- 特定の日時・時間帯のシフトについて、発信者または別の人が「@〇〇さんお願いします」「この枠に〇〇さんを追加して」など、誰かをシフトに割り当てる発言がある
- 利用者ID（group_account）、日時（shift_date）、時間帯（shift_time）、担当者ID（user_id）が会話の中から推定できる

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

    // ログに記録（共通）
    await supabase.from("msg_lw_analysis_log").insert({
      timestamp: new Date().toISOString(),
      channel_id: user_id,
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
        requested_by: user_id,
        status: "pending",
      });

      await supabase.from("msg_lw_log").update({ status: 3 }).in("id", ids); // 3 = dispatched
    } catch {
      await supabase.from("msg_lw_analysis_log").insert({
        timestamp: new Date().toISOString(),
        channel_id: user_id,
        text: responseText,
        reason: "JSON parse error",
      });
      await supabase.from("msg_lw_log").update({ status: 4 }).in("id", ids); // 4 = error
    }
  }
};

export default analyzePendingTalksAndDispatch;
