// =============================================================
// src/constants/cm/serviceCredentials.ts
// サービス認証情報関連の定数
// =============================================================

import type { CmServiceCredentialsFilters } from '@/types/cm/serviceCredentials';

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
 * 管理画面用フィルターのデフォルト値
 */
export const CM_SERVICE_CREDENTIALS_DEFAULT_FILTERS: CmServiceCredentialsFilters = {
  serviceName: '',
  showInactive: false,
};
