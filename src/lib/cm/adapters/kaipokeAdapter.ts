// src/lib/cm/adapters/kaipokeAdapter.ts

import type { CmUserData, UserAdapter } from '../types';

/**
 * カイポケからユーザーデータを取得するアダプター
 * TODO: カイポケAPI連携実装時に完成させる
 */
export const kaipokeAdapter: UserAdapter = {
  async fetchUser(): Promise<CmUserData | null> {
    console.warn('kaipokeAdapter: Not implemented yet');
    return null;
  },

  async updatePhotoUrl(url: string | null): Promise<void> {
    console.warn(`kaipokeAdapter.updatePhotoUrl: Not supported (url: ${url})`);
    throw new Error('カイポケ連携時は画像更新をサポートしていません');
  },
};

export default kaipokeAdapter;