// src/lib/cm/userAdapter.ts

import type { UserSource, UserAdapter, CmUserData } from './types';
import { supabaseAdapter } from './adapters/supabaseAdapter';
import { mockAdapter } from './adapters/mockAdapter';
import { kaipokeAdapter } from './adapters/kaipokeAdapter';

/**
 * アダプターのレジストリ
 */
const adapters = {
  supabase: supabaseAdapter,
  mock: mockAdapter,
  kaipoke: kaipokeAdapter,
} as const;

/**
 * 指定されたソースに対応するアダプターを取得
 */
export function getAdapter(source: UserSource): UserAdapter {
  const adapter = adapters[source];
  if (!adapter) {
    console.warn(`Unknown source: ${source}, falling back to mock`);
    return adapters.mock;
  }
  return adapter;
}

/**
 * ユーザーデータを取得（ソース指定）
 */
export async function fetchCmUser(source: UserSource): Promise<CmUserData | null> {
  const adapter = getAdapter(source);
  return adapter.fetchUser();
}

/**
 * プロフィール画像を更新（ソース指定）
 */
export async function updateCmUserPhoto(
  source: UserSource,
  userId: string,
  url: string | null
): Promise<void> {
  const adapter = getAdapter(source);
  if (adapter.updatePhotoUrl) {
    await adapter.updatePhotoUrl(userId, url);
  } else {
    throw new Error(`${source} アダプターは画像更新をサポートしていません`);
  }
}

/**
 * 環境変数からデフォルトのソースを取得
 */
export function getDefaultSource(): UserSource {
  const envSource = process.env.NEXT_PUBLIC_CM_USER_SOURCE;
  if (envSource === 'supabase' || envSource === 'mock' || envSource === 'kaipoke') {
    return envSource;
  }
  // デフォルトはsupabase
  return 'supabase';
}

// 型とアダプターをまとめてエクスポート
export { supabaseAdapter, mockAdapter, kaipokeAdapter };
export type { UserSource, UserAdapter, CmUserData };