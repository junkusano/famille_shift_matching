// src/lib/cm/adapters/mockAdapter.ts

import type { CmUserData, UserAdapter } from '../types';

/**
 * モックユーザーデータ（開発・テスト用）
 * roleはDBの値と同じ形式（admin, manager, member）を使用
 */
const mockUsers: Record<string, CmUserData> = {
  admin: {
    userId: 'mock-admin-001',
    lastNameKanji: '山田',
    firstNameKanji: '太郎',
    lastNameKana: 'やまだ',
    firstNameKana: 'たろう',
    displayName: '山田 太郎',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin&backgroundColor=c0aede',
    role: 'admin',
    email: 'admin@example.com',
  },
  manager: {
    userId: 'mock-manager-001',
    lastNameKanji: '佐藤',
    firstNameKanji: '花子',
    lastNameKana: 'さとう',
    firstNameKana: 'はなこ',
    displayName: '佐藤 花子',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=manager&backgroundColor=b6e3f4',
    role: 'manager',
    email: 'manager@example.com',
  },
  member: {
    userId: 'mock-member-001',
    lastNameKanji: '鈴木',
    firstNameKanji: '一郎',
    lastNameKana: 'すずき',
    firstNameKana: 'いちろう',
    displayName: '鈴木 一郎',
    photoUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=member&backgroundColor=ffdfbf',
    role: 'member',
    email: 'member@example.com',
  },
};

/**
 * 現在のモックユーザー（切り替え可能）
 */
let currentMockRole: keyof typeof mockUsers = 'admin';
let currentMockUser: CmUserData = { ...mockUsers[currentMockRole] };

/**
 * モックユーザーの権限を切り替え（開発用）
 */
export function setMockRole(role: keyof typeof mockUsers): void {
  currentMockRole = role;
  currentMockUser = { ...mockUsers[role] };
}

/**
 * カスタムモックユーザーを設定（テスト用）
 */
export function setMockUser(user: Partial<CmUserData>): void {
  currentMockUser = {
    ...mockUsers[currentMockRole],
    ...user,
  };
}

/**
 * モックデータを初期状態にリセット
 */
export function resetMock(): void {
  currentMockRole = 'admin';
  currentMockUser = { ...mockUsers.admin };
}

/**
 * モックアダプター実装
 */
export const mockAdapter: UserAdapter = {
  async fetchUser(): Promise<CmUserData | null> {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { ...currentMockUser };
  },

  async updatePhotoUrl(userId: string, url: string | null): Promise<void> {
    console.log(`mockAdapter.updatePhotoUrl: userId=${userId}, url=${url}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    currentMockUser = {
      ...currentMockUser,
      photoUrl: url,
    };
  },
};

export default mockAdapter;