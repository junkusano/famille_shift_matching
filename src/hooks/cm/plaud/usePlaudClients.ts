// =============================================================
// src/hooks/cm/plaud/usePlaudClients.ts
// 利用者検索フック（Server Action版）
// =============================================================

import { useState, useCallback } from 'react';
import { searchClients } from '@/lib/cm/clients/actions';
import { CmClient } from '@/types/cm/plaud';

// =============================================================
// 型定義
// =============================================================

type UsePlaudClientsReturn = {
  clients: CmClient[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  search: (query: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  clear: () => void;
};

// =============================================================
// フック本体
// =============================================================

export function usePlaudClients(): UsePlaudClientsReturn {
  const [clients, setClients] = useState<CmClient[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 検索実行
  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setClients([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // searchClients Server Action を使用
      const result = await searchClients({
        search: query,
        status: 'active',
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      // レスポンスをCmClient型にマッピング
      const mappedClients: CmClient[] = (result.data ?? []).map((c) => ({
        id: c.id,
        kaipoke_cs_id: c.kaipoke_cs_id ?? null,
        name: c.name,
        kana: c.kana ?? null,
        birth_date: c.birth_date ?? null,
        is_active: c.is_active,
      }));

      setClients(mappedClients);
    } catch (err) {
      const message = err instanceof Error ? err.message : '検索に失敗しました';
      setError(message);
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // クリア
  const clear = useCallback(() => {
    setClients([]);
    setSearchQuery('');
    setError(null);
  }, []);

  return {
    clients,
    searchQuery,
    setSearchQuery,
    search,
    isLoading,
    error,
    clear,
  };
}