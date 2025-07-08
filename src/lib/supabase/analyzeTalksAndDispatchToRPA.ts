import OpenAI from "openai";
import { handleParsedResult } from "@/lib/supabase/handleParsedResult";
import { ChatCompletionMessageParam } from "openai/resources";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeTalksAndDispatchToRPA({
  talks,
  user_id,
}: {
  talks: { role: "user" | "assistant"; content: string }[];
  user_id: string;
}) {
  if (!talks?.length) return;

  const systemPrompt: ChatCompletionMessageParam = {
    role: "system",
    content: `
あなたは会話の流れから、RPAに必要な処理指示を構造化データで抽出するアシスタントです。
以下のどちらかに該当する場合、該当のテンプレートIDを含むJSONで回答してください。

---

【1. シフト削除】
template_id: "13a881d9-4104-4198-a0a3-3d3e89427472"
request_detailの中には以下を含めてください：
{
  "group_account": "利用者ID（例: A1234）",
  "shift_date": "対象日（例: 2025-07-10）",
  "shift_time": "時間帯（例: 9:00-11:00）"
}

---

【2. シフト追加】
template_id: "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a"
request_detailの中には以下を含めてください：
{
  "group_account": "利用者ID（例: A1234）",
  "shift_date": "対象日（例: 2025-07-10）",
  "shift_time": "時間帯（例: 9:00-11:00）",
  "user_id": "担当ヘルパーID（例: U5678）"
}

---

【処理不要の場合】
「処理なし」とだけ返してください。

必ず以下の形式のいずれかで返してください：
- JSON（上記構造）または
- 「処理なし」
`,
  };

  const messages: ChatCompletionMessageParam[] = [
    systemPrompt,
    ...talks.map((t) => ({ role: t.role, content: t.content })),
  ];

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages,
    temperature: 0,
  });

  const responseText = res.choices[0].message.content ?? "";
  await handleParsedResult({ responseText, user_id });
}
