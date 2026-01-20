// =============================================================
// src/types/cm/serviceCredentials.ts
// サービス認証情報関連の型定義
// =============================================================

/**
 * サービス認証情報エントリ
 * テーブル: cm_rpa_credentials
 */
export type CmServiceCredential = {
  /** 内部ID */
  id: number;
  /** サービス名（キー） */
  service_name: string;
  /** 表示ラベル */
  label: string | null;
  /** 認証情報（JSON） */
  credentials: Record<string, unknown>;
  /** 有効フラグ */
  is_active: boolean;
  /** 作成日時 */
  created_at: string;
  /** 更新日時 */
  updated_at: string;
};

/**
 * サービス認証情報（機密情報マスク済み）
 * 一覧表示用
 */
export type CmServiceCredentialMasked = Omit<CmServiceCredential, 'credentials'> & {
  /** 認証情報（マスク済み） */
  credentials_masked: Record<string, string>;
  /** 認証情報のキー一覧 */
  credentials_keys: string[];
};

/**
 * サービス認証情報作成リクエスト
 */
export type CmServiceCredentialCreateRequest = {
  service_name: string;
  label?: string | null;
  credentials: Record<string, unknown>;
  is_active?: boolean;
};

/**
 * サービス認証情報更新リクエスト
 */
export type CmServiceCredentialUpdateRequest = {
  service_name?: string;
  label?: string | null;
  credentials?: Record<string, unknown>;
  is_active?: boolean;
};

/**
 * 定義済みサービス（補完用）
 */
export const CM_PREDEFINED_SERVICES = [
  {
    service_name: 'local_fax_phonebook_gas',
    label: 'ローカルFAX電話帳 GAS Web App',
    credentials_template: { url: '' },
  },
  {
    service_name: 'kaipoke_rpa',
    label: 'カイポケRPA',
    credentials_template: { user: '', password: '' },
  },
] as const;

/**
 * サービス名からラベルを取得
 */
export function getServiceLabel(serviceName: string): string {
  const predefined = CM_PREDEFINED_SERVICES.find(s => s.service_name === serviceName);
  return predefined?.label || serviceName;
}
