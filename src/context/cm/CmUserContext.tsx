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
import type { CmUserData, CmUserContextValue, UserSource } from '@/lib/cm/types';
import { fetchCmUser, updateCmUserPhoto, getDefaultSource } from '@/lib/cm/userAdapter';

/**
 * Context
 */
const CmUserContext = createContext<CmUserContextValue | undefined>(undefined);

/**
 * Provider Props
 */
interface CmUserProviderProps {
  children: ReactNode;
  source?: UserSource;
}

/**
 * cm-portal用ユーザーProvider
 */
export function CmUserProvider({ children, source }: CmUserProviderProps) {
  const resolvedSource = source || getDefaultSource();
  
  const [user, setUser] = useState<CmUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const userData = await fetchCmUser(resolvedSource);
      setUser(userData);
    } catch (err) {
      console.error('CmUserProvider: Failed to load user', err);
      setError(err instanceof Error ? err : new Error('ユーザー情報の取得に失敗しました'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [resolvedSource]);

  const updatePhoto = useCallback(async (url: string | null) => {
    if (!user) {
      throw new Error('ユーザーがログインしていません');
    }

    try {
      await updateCmUserPhoto(resolvedSource, user.userId, url);
      setUser((prev) => (prev ? { ...prev, photoUrl: url } : null));
    } catch (err) {
      console.error('CmUserProvider: Failed to update photo', err);
      throw err;
    }
  }, [user, resolvedSource]);

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
    source: resolvedSource,
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