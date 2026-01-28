// =============================================================
// src/hooks/cm/plaud/usePlaudTemplates.ts
// テンプレート管理フック（Server Action版）
// =============================================================

import { useState, useEffect, useCallback } from 'react';
import {
  getPlaudTemplates,
  createPlaudTemplate,
  updatePlaudTemplate,
  deletePlaudTemplate,
  type PlaudTemplate,
} from '@/lib/cm/plaud/templates';
import {
  CmPlaudTemplateCreateRequest,
  CmPlaudTemplateUpdateRequest,
} from '@/types/cm/plaud';

// =============================================================
// 型定義
// =============================================================

type UsePlaudTemplatesReturn = {
  templates: PlaudTemplate[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (data: CmPlaudTemplateCreateRequest) => Promise<PlaudTemplate | null>;
  update: (id: number, data: CmPlaudTemplateUpdateRequest) => Promise<PlaudTemplate | null>;
  remove: (id: number) => Promise<boolean>;
};

// =============================================================
// フック本体
// =============================================================

export function usePlaudTemplates(activeOnly: boolean = false): UsePlaudTemplatesReturn {
  const [templates, setTemplates] = useState<PlaudTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getPlaudTemplates(activeOnly);

      if (!result.ok) {
        throw new Error(result.error);
      }

      setTemplates(result.data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'テンプレートの取得に失敗しました';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeOnly]);

  // 初回取得
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 作成
  const create = useCallback(async (
    data: CmPlaudTemplateCreateRequest
  ): Promise<PlaudTemplate | null> => {
    try {
      const result = await createPlaudTemplate(data);

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステート更新
      if (result.data) {
        setTemplates((prev) => [...prev, result.data!]);
      }

      return result.data ?? null;
    } catch (err) {
      console.error('create template error:', err);
      return null;
    }
  }, []);

  // 更新
  const update = useCallback(async (
    id: number,
    data: CmPlaudTemplateUpdateRequest
  ): Promise<PlaudTemplate | null> => {
    try {
      const result = await updatePlaudTemplate(id, data);

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステート更新
      if (result.data) {
        setTemplates((prev) =>
          prev.map((t) => (t.id === id ? result.data! : t))
        );
      }

      return result.data ?? null;
    } catch (err) {
      console.error('update template error:', err);
      return null;
    }
  }, []);

  // 削除
  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      const result = await deletePlaudTemplate(id);

      if (!result.ok) {
        throw new Error(result.error);
      }

      // ローカルステート更新
      setTemplates((prev) => prev.filter((t) => t.id !== id));

      return true;
    } catch (err) {
      console.error('delete template error:', err);
      return false;
    }
  }, []);

  return {
    templates,
    isLoading,
    error,
    refresh: fetchData,
    create,
    update,
    remove,
  };
}