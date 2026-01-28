// =============================================================
// src/components/cm-components/service-credentials/CmServiceCredentialsModal.tsx
// サービス認証情報 - 登録・編集モーダル
// =============================================================

'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { CmServiceCredential, CmServiceCredentialMasked } from '@/types/cm/serviceCredentials';
import { CM_PREDEFINED_SERVICES } from '@/types/cm/serviceCredentials';

type Props = {
  isOpen: boolean;
  entry: CmServiceCredentialMasked | null;
  fullEntry: CmServiceCredential | null; // 編集時に取得した完全なエントリ
  isLoadingEntry: boolean;
  onClose: () => void;
  onSave: (data: {
    service_name: string;
    label?: string | null;
    credentials: Record<string, unknown>;
    is_active?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  isSaving: boolean;
};

type CredentialItem = {
  key: string;
  value: string;
};

type FormData = {
  service_name: string;
  label: string;
  is_active: boolean;
};

type FormErrors = {
  service_name?: string;
  credentials?: string;
};

export function CmServiceCredentialsModal({
  isOpen,
  entry,
  fullEntry,
  isLoadingEntry,
  onClose,
  onSave,
  isSaving,
}: Props) {
  const [formData, setFormData] = useState<FormData>({
    service_name: '',
    label: '',
    is_active: true,
  });
  const [credentialItems, setCredentialItems] = useState<CredentialItem[]>([{ key: '', value: '' }]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditMode = !!entry;

  // モーダルが開いたときにフォームを初期化
  useEffect(() => {
    if (isOpen) {
      if (fullEntry) {
        // 編集時（完全なエントリを使用）
        setFormData({
          service_name: fullEntry.service_name || '',
          label: fullEntry.label || '',
          is_active: fullEntry.is_active ?? true,
        });
        // credentials をキー/バリューのリストに変換
        const credentials = fullEntry.credentials || {};
        const items = Object.entries(credentials).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value),
        }));
        setCredentialItems(items.length > 0 ? items : [{ key: '', value: '' }]);
      } else if (entry) {
        // 編集時（まだfullEntryがロードされていない）
        setFormData({
          service_name: entry.service_name || '',
          label: entry.label || '',
          is_active: entry.is_active ?? true,
        });
        // マスク済みなので空にしておく
        setCredentialItems([{ key: '', value: '' }]);
      } else {
        // 新規登録
        setFormData({
          service_name: '',
          label: '',
          is_active: true,
        });
        setCredentialItems([{ key: '', value: '' }]);
      }
      setErrors({});
      setSubmitError(null);
    }
  }, [entry, fullEntry, isOpen]);

  const handleChange = (field: keyof FormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    setSubmitError(null);
  };

  const handleCredentialChange = (index: number, field: 'key' | 'value', value: string) => {
    setCredentialItems((prev) => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
    if (errors.credentials) {
      setErrors((prev) => ({ ...prev, credentials: undefined }));
    }
  };

  const handleAddCredential = () => {
    setCredentialItems((prev) => [...prev, { key: '', value: '' }]);
  };

  const handleRemoveCredential = (index: number) => {
    setCredentialItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectPredefined = (serviceName: string) => {
    const predefined = CM_PREDEFINED_SERVICES.find(s => s.service_name === serviceName);
    if (predefined) {
      setFormData((prev) => ({
        ...prev,
        service_name: predefined.service_name,
        label: predefined.label,
      }));
      const template = predefined.credentials_template;
      const items = Object.keys(template).map((key) => ({ key, value: '' }));
      setCredentialItems(items.length > 0 ? items : [{ key: '', value: '' }]);
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.service_name.trim()) {
      newErrors.service_name = 'サービス名は必須です';
    }

    // 認証情報のバリデーション
    const validItems = credentialItems.filter(item => item.key.trim() !== '');
    if (validItems.length === 0) {
      newErrors.credentials = '認証情報は少なくとも1つ必要です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // credentials を構築
    const credentials: Record<string, string> = {};
    for (const item of credentialItems) {
      if (item.key.trim()) {
        credentials[item.key.trim()] = item.value;
      }
    }

    const result = await onSave({
      service_name: formData.service_name.trim(),
      label: formData.label.trim() || null,
      credentials,
      is_active: formData.is_active,
    });

    if (result.ok === true) {
      onClose();
    } else {
      setSubmitError(result.error || '保存に失敗しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* モーダル */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEditMode ? 'サービス認証情報を編集' : 'サービス認証情報を登録'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
            {/* ローディング中 */}
            {isLoadingEntry && (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                読み込み中...
              </div>
            )}

            {!isLoadingEntry && (
              <>
                {/* 送信エラー */}
                {submitError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {submitError}
                  </div>
                )}

                {/* 定義済みサービス選択（新規時のみ） */}
                {!isEditMode && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      テンプレートから選択
                    </label>
                    <select
                      onChange={(e) => e.target.value && handleSelectPredefined(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      defaultValue=""
                    >
                      <option value="">-- 選択してください（任意）--</option>
                      {CM_PREDEFINED_SERVICES.map((service) => (
                        <option key={service.service_name} value={service.service_name}>
                          {service.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* サービス名 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    サービス名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.service_name}
                    onChange={(e) => handleChange('service_name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono ${
                      errors.service_name ? 'border-red-400' : 'border-slate-300'
                    }`}
                    placeholder="例: local_fax_phonebook_gas"
                    disabled={isEditMode}
                  />
                  {errors.service_name && (
                    <p className="mt-1 text-sm text-red-500">{errors.service_name}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    英数字とアンダースコアのみ使用可能
                  </p>
                </div>

                {/* ラベル */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ラベル
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={(e) => handleChange('label', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    placeholder="例: ローカルFAX電話帳 GAS Web App"
                  />
                </div>

                {/* 認証情報 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    認証情報 <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    {credentialItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.key}
                          onChange={(e) => handleCredentialChange(index, 'key', e.target.value)}
                          className="w-1/3 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                          placeholder="キー"
                        />
                        <span className="text-slate-400">:</span>
                        <input
                          type="text"
                          value={item.value}
                          onChange={(e) => handleCredentialChange(index, 'value', e.target.value)}
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="値"
                        />
                        {credentialItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCredential(index)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCredential}
                    className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <Plus className="w-4 h-4" />
                    項目を追加
                  </button>
                  {errors.credentials && (
                    <p className="mt-1 text-sm text-red-500">{errors.credentials}</p>
                  )}
                </div>

                {/* 有効フラグ */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_active" className="text-sm text-slate-700">
                    有効
                  </label>
                </div>
              </>
            )}
          </div>

          {/* フッター */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white transition-colors text-sm font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoadingEntry}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {isEditMode ? '更新' : '登録'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
