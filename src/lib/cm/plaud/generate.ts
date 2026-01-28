// =============================================================
// src/lib/cm/plaud/generate.ts
// Plaud AI生成 Server Action
// =============================================================

"use server";

import { supabaseAdmin } from "@/lib/supabase/service";
import { createLogger } from "@/lib/common/logger";
import OpenAI from "openai";

const logger = createLogger("lib/cm/plaud/generate");

// OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// =============================================================
// 定数
// =============================================================

// 使用するモデル（gpt-4o-mini: 高速・低コスト、gpt-4o: 高精度）
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 2000;
const TEMPERATURE = 0.7;

// =============================================================
// Types
// =============================================================

export type GenerateResultItem = {
  template_id: number;
  success: boolean;
  output_text?: string;
  error?: string;
};

export type ActionResult<T = void> = {
  ok: true;
  data?: T;
} | {
  ok: false;
  error: string;
};

// =============================================================
// AI生成
// =============================================================

export async function generateWithTemplates(
  transcript: string,
  templateIds: number[]
): Promise<ActionResult<GenerateResultItem[]>> {
  try {
    // バリデーション
    if (!transcript || typeof transcript !== "string") {
      return { ok: false, error: "文字起こしデータは必須です" };
    }

    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return { ok: false, error: "テンプレートIDを1つ以上指定してください" };
    }

    logger.info("AI生成開始", { templateCount: templateIds.length });

    // テンプレート取得
    const { data: templates, error: fetchError } = await supabaseAdmin
      .from("cm_plaud_mgmt_templates")
      .select("*")
      .in("id", templateIds)
      .eq("is_active", true);

    if (fetchError) {
      logger.error("テンプレート取得エラー", { error: fetchError.message });
      return { ok: false, error: "テンプレートの取得に失敗しました" };
    }

    if (!templates || templates.length === 0) {
      return { ok: false, error: "有効なテンプレートが見つかりません" };
    }

    // 各テンプレートで生成
    const results: GenerateResultItem[] = [];

    for (const template of templates) {
      try {
        // プロンプト構築
        const userPrompt = template.user_prompt_template.replace(
          /\{\{transcript\}\}/g,
          transcript
        );

        const systemPrompt = template.system_prompt || 
          "あなたは介護支援専門員（ケアマネジャー）のアシスタントです。";

        // OpenAI API呼び出し
        const response = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        });

        // レスポンス抽出
        const outputText = response.choices[0]?.message?.content?.trim();

        if (!outputText) {
          throw new Error("AIからの応答が空でした");
        }

        results.push({
          template_id: template.id,
          success: true,
          output_text: outputText,
        });

        logger.info("テンプレート生成成功", { templateId: template.id });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "生成に失敗しました";
        logger.error("テンプレート生成エラー", {
          templateId: template.id,
          error: errorMessage,
        });

        results.push({
          template_id: template.id,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info("AI生成完了", { total: results.length, success: successCount });

    return { ok: true, data: results };
  } catch (error) {
    logger.error("予期せぬエラー", error as Error);
    return { ok: false, error: "サーバーエラーが発生しました" };
  }
}
