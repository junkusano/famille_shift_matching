// =============================================================
// src/lib/prompt-template.ts
// プロンプトテンプレート取得・適用ユーティリティ
// =============================================================
//
// 【概要】
// cm_prompt_templatesテーブルからプロンプトテンプレートを取得し、
// プレースホルダーを実際の値で置換する機能を提供
//
// 【使用例】
// const result = await getPromptWithVariables('cm_plaud_support_progress_summary', {
//   contents: plaudSum.contents,
// });
// // result.prompt = "今日の訪問では...を1000文字以内に要約..."
// // result.model = "gpt-4o-mini"
// // result.max_tokens = 2000
// // result.temperature = 0.3
//
// =============================================================

import { createClient } from "@supabase/supabase-js";

// Supabase Admin Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// =============================================================
// 型定義
// =============================================================

/**
 * 変数定義の型
 */
export type PromptVariable = {
  name: string;          // 変数名（プレースホルダー名）
  description: string;   // 説明
  required: boolean;     // 必須かどうか
};

/**
 * cm_prompt_templates テーブルの行型
 */
export type PromptTemplate = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  prompt_template: string;
  variables: PromptVariable[];
  model: string;
  max_tokens: number;
  temperature: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * getPromptWithVariables の戻り値
 */
export type PromptResult = {
  prompt: string;        // 変数置換後のプロンプト
  model: string;         // OpenAIモデル名
  max_tokens: number;    // max_tokens
  temperature: number;   // temperature
  templateKey: string;   // 使用したテンプレートのキー
  templateName: string;  // 使用したテンプレートの名前
};

/**
 * エラー型
 */
export class PromptTemplateError extends Error {
  constructor(
    message: string,
    public code: 'NOT_FOUND' | 'INACTIVE' | 'MISSING_VARIABLE' | 'DB_ERROR'
  ) {
    super(message);
    this.name = 'PromptTemplateError';
  }
}

// =============================================================
// メイン関数
// =============================================================

/**
 * プロンプトテンプレートを取得し、変数を置換して返す
 * 
 * @param key - テンプレートのキー（例: 'cm_plaud_support_progress_summary'）
 * @param variables - 置換する変数のオブジェクト（例: { contents: "音声テキスト..." }）
 * @returns プロンプトとOpenAIパラメータ
 * @throws PromptTemplateError
 * 
 * @example
 * const result = await getPromptWithVariables('cm_plaud_support_progress_summary', {
 *   contents: plaudSum.contents,
 * });
 * 
 * const response = await openai.chat.completions.create({
 *   model: result.model,
 *   max_tokens: result.max_tokens,
 *   temperature: result.temperature,
 *   messages: [{ role: "user", content: result.prompt }],
 * });
 */
export async function getPromptWithVariables(
  key: string,
  variables: Record<string, string>
): Promise<PromptResult> {
  // ─────────────────────────────────────────────────────────────
  // 1. テンプレートを取得
  // ─────────────────────────────────────────────────────────────
  const template = await getPromptTemplate(key);

  // ─────────────────────────────────────────────────────────────
  // 2. 必須変数のチェック
  // ─────────────────────────────────────────────────────────────
  const requiredVars = template.variables.filter(v => v.required);
  for (const v of requiredVars) {
    if (!(v.name in variables) || variables[v.name] === undefined || variables[v.name] === null) {
      throw new PromptTemplateError(
        `必須変数 '${v.name}' が指定されていません（${v.description}）`,
        'MISSING_VARIABLE'
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. プレースホルダーを置換
  // ─────────────────────────────────────────────────────────────
  let prompt = template.prompt_template;
  
  for (const [name, value] of Object.entries(variables)) {
    // {{変数名}} を実際の値で置換
    const placeholder = `{{${name}}}`;
    prompt = prompt.replaceAll(placeholder, value);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 結果を返却
  // ─────────────────────────────────────────────────────────────
  return {
    prompt,
    model: template.model,
    max_tokens: template.max_tokens,
    temperature: template.temperature,
    templateKey: template.key,
    templateName: template.name,
  };
}

/**
 * プロンプトテンプレートを取得する（変数置換なし）
 * 
 * @param key - テンプレートのキー
 * @returns テンプレート情報
 * @throws PromptTemplateError
 */
export async function getPromptTemplate(key: string): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from('cm_prompt_templates')
    .select('*')
    .eq('key', key)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new PromptTemplateError(
        `プロンプトテンプレート '${key}' が見つかりません`,
        'NOT_FOUND'
      );
    }
    throw new PromptTemplateError(
      `プロンプトテンプレート取得エラー: ${error.message}`,
      'DB_ERROR'
    );
  }

  if (!data.is_active) {
    throw new PromptTemplateError(
      `プロンプトテンプレート '${key}' は無効化されています`,
      'INACTIVE'
    );
  }

  return data as PromptTemplate;
}

/**
 * 全てのアクティブなプロンプトテンプレートを取得する
 * 
 * @returns テンプレート一覧
 */
export async function getAllPromptTemplates(): Promise<PromptTemplate[]> {
  const { data, error } = await supabase
    .from('cm_prompt_templates')
    .select('*')
    .eq('is_active', true)
    .order('key', { ascending: true });

  if (error) {
    throw new PromptTemplateError(
      `プロンプトテンプレート一覧取得エラー: ${error.message}`,
      'DB_ERROR'
    );
  }

  return (data || []) as PromptTemplate[];
}

/**
 * プロンプトテンプレートを更新する
 * 
 * @param key - テンプレートのキー
 * @param updates - 更新内容
 * @returns 更新後のテンプレート
 */
export async function updatePromptTemplate(
  key: string,
  updates: Partial<Pick<PromptTemplate, 'prompt_template' | 'variables' | 'model' | 'max_tokens' | 'temperature' | 'is_active' | 'name' | 'description'>>
): Promise<PromptTemplate> {
  const { data, error } = await supabase
    .from('cm_prompt_templates')
    .update(updates)
    .eq('key', key)
    .select()
    .single();

  if (error) {
    throw new PromptTemplateError(
      `プロンプトテンプレート更新エラー: ${error.message}`,
      'DB_ERROR'
    );
  }

  return data as PromptTemplate;
}
