// src/hooks/cm/users/useCmUser.ts
'use client';

import { useCmUserContext } from '@/context/cm/CmUserContext';
import type { CmUserData, CmRole, CmServiceType } from '@/lib/cm/types';

/**
 * ユーザー情報全体を取得するhook
 */
export function useCmUser() {
  const { user, loading, error, updatePhoto, refresh } = useCmUserContext();
  return { user, loading, error, updatePhoto, refresh };
}

/**
 * ユーザーの権限のみを取得するhook
 */
export function useCmRole(): CmRole {
  const { user } = useCmUserContext();
  return user?.role ?? null;
}

/**
 * 特定の権限を持っているかチェックするhook
 */
export function useCmHasRole(allowedRoles: string[]): boolean {
  const role = useCmRole();
  if (!role) return false;
  return allowedRoles.includes(role);
}

/**
 * 管理者かどうかをチェックするhook
 */
export function useCmIsAdmin(): boolean {
  return useCmHasRole(['admin']);
}

/**
 * 管理者またはマネージャーかどうかをチェックするhook
 */
export function useCmIsManagerOrAdmin(): boolean {
  return useCmHasRole(['admin', 'manager']);
}

/**
 * ユーザーの表示名を取得するhook
 */
export function useCmDisplayName(): string | null {
  const { user } = useCmUserContext();
  return user?.displayName ?? null;
}

/**
 * ユーザーの画像URLを取得するhook
 */
export function useCmPhotoUrl(): string | null {
  const { user } = useCmUserContext();
  return user?.photoUrl ?? null;
}

/**
 * ユーザーのサービス種別を取得するhook
 */
export function useCmServiceType(): CmServiceType {
  const { user } = useCmUserContext();
  return user?.serviceType ?? null;
}

/**
 * 訪問介護と居宅の両方にアクセス可能かどうかをチェックするhook
 */
export function useCmIsBoth(): boolean {
  const serviceType = useCmServiceType();
  return serviceType === 'both';
}

/**
 * 訪問介護ポータルにアクセス可能かどうかをチェックするhook
 * (both または houmon_kaigo)
 */
export function useCmCanAccessHoukanPortal(): boolean {
  const serviceType = useCmServiceType();
  return serviceType === 'both' || serviceType === 'houmon_kaigo';
}

export type { CmUserData, CmRole, CmServiceType };