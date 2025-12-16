// src/context/cm/CmUserContext.tsx
'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { CmUserData, CmUserContextValue } from '@/lib/cm/types';
import { fetchCmUser, updateCmUserPhoto } from '@/lib/cm/userAdapter';
import { createLogger } from '@/lib/common/logger';

const logger = createLogger('cm/context/CmUserContext');

/**
 * Context
 */
const CmUserContext = createContext<CmUserContextValue | undefined>(undefined);

/**
 * Provider Props
 */
interface CmUserProviderProps {
  children: ReactNode;
}

/**
 * cm-portal用ユーザーProvider
 */
export function CmUserProvider({ children }: CmUserProviderProps) {
  const [user, setUser] = useState<CmUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const userData = await fetchCmUser();
      setUser(userData);
    } catch (err) {
      logger.error('ユーザー情報の取得に失敗', err);
      setError(err instanceof Error ? err : new Error('ユーザー情報の取得に失敗しました'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePhoto = useCallback(async (url: string | null) => {
    if (!user) {
      throw new Error('ユーザーがログインしていません');
    }

    try {
      await updateCmUserPhoto(user.userId, url);
      setUser((prev) => (prev ? { ...prev, photoUrl: url } : null));
    } catch (err) {
      logger.error('プロフィール画像の更新に失敗', err);
      throw err;
    }
  }, [user]);

  const refresh = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const value: CmUserContextValue = {
    user,
    loading,
    error,
    updatePhoto,
    refresh,
  };

  return (
    <CmUserContext.Provider value={value}>
      {children}
    </CmUserContext.Provider>
  );
}

/**
 * CmUserContextを使用するhook
 */
export function useCmUserContext(): CmUserContextValue {
  const context = useContext(CmUserContext);
  if (!context) {
    throw new Error('useCmUserContext must be used within CmUserProvider');
  }
  return context;
}

export default CmUserProvider;