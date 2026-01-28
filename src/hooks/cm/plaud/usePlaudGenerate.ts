// =============================================================
// src/hooks/cm/plaud/usePlaudGenerate.ts
// AI生成フック（Server Action版）
// =============================================================

import { useState, useCallback } from 'react';
import {
  generateWithTemplates,
  type GenerateResultItem,
} from '@/lib/cm/plaud/generate';

// =============================================================
// 型定義
// =============================================================

type UsePlaudGenerateReturn = {
  results: Record<number, string>;
  isGenerating: boolean;
  error: string | null;
  generate: (transcript: string, templateIds: number[]) => Promise<boolean>;
  clearResults: () => void;
};

// =============================================================
// フック本体
// =============================================================

export function usePlaudGenerate(): UsePlaudGenerateReturn {
  const [results, setResults] = useState<Record<number, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 生成実行
  const generate = useCallback(async (
    transcript: string,
    templateIds: number[]
  ): Promise<boolean> => {
    if (!transcript || templateIds.length === 0) {
      setError('文字起こしデータとテンプレートを指定してください');
      return false;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateWithTemplates(transcript, templateIds);

      if (!result.ok) {
        throw new Error(result.error);
      }

      // 結果をマッピング
      const newResults: Record<number, string> = {};
      for (const item of result.data ?? []) {
        if (item.success && item.output_text) {
          newResults[item.template_id] = item.output_text;
        }
      }

      setResults((prev) => ({ ...prev, ...newResults }));

      // エラーがあった場合は警告
      const errors = (result.data ?? []).filter((r) => !r.success);
      if (errors.length > 0) {
        const errorMessages = errors.map((e) => e.error).join(', ');
        setError(`一部のテンプレートで生成に失敗しました: ${errorMessages}`);
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI生成に失敗しました';
      setError(message);
      return false;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // 結果クリア
  const clearResults = useCallback(() => {
    setResults({});
    setError(null);
  }, []);

  return {
    results,
    isGenerating,
    error,
    generate,
    clearResults,
  };
}