// =============================================================
// src/components/cm-components/local-fax-phonebook/CmLocalFaxPhonebookModal.tsx
// ローカルFAX電話帳 - 登録・編集モーダル（カイポケ警告付き）
// =============================================================

'use client';

import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import type {
  CmLocalFaxPhonebookEntry,
  CmKaipokeOfficeInfo,
} from '@/types/cm/localFaxPhonebook';

type Props = {
  isOpen: boolean;
  entry: CmLocalFaxPhonebookEntry | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    name_kana?: string | null;
    fax_number?: string | null;
    notes?: string | null;
    is_active?: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  isSaving: boolean;
  // カイポケチェック関連
  kaipokeCheckResult: CmKaipokeOfficeInfo[];
  checkingKaipoke: boolean;
  onCheckKaipoke: (faxNumber: string) => void;
  onClearKaipokeCheck: () => void;
};

type FormData = {
  name: string;
  name_kana: string;
  fax_number: string;
  notes: string;
  is_active: boolean;
};

type FormErrors = {
  name?: string;
};

export function CmLocalFaxPhonebookModal({
  isOpen,
  entry,
  onClose,
  onSave,
  isSaving,
  kaipokeCheckResult,
  checkingKaipoke,
  onCheckKaipoke,
  onClearKaipokeCheck,
}: Props) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    name_kana: '',
    fax_number: '',
    notes: '',
    is_active: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isEditMode = !!entry;

  // モーダルが開いたときにフォームを初期化
  useEffect(() => {
    if (isOpen) {
      if (entry) {
        setFormData({
          name: entry.name || '',
          name_kana: entry.name_kana || '',
          fax_number: entry.fax_number || '',
          notes: entry.notes || '',
          is_active: entry.is_active ?? true,
        });
        // 編集時は既存のFAX番号でカイポケチェック
        if (entry.fax_number) {
          onCheckKaipoke(entry.fax_number);
        }
      } else {
        setFormData({
          name: '',
          name_kana: '',
          fax_number: '',
          notes: '',
          is_active: true,
        });
        onClearKaipokeCheck();
      }
      setErrors({});
      setSubmitError(null);
    }
  }, [entry, isOpen, onCheckKaipoke, onClearKaipokeCheck]);

  const handleChange = (
    field: keyof FormData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // エラーをクリア
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    setSubmitError(null);

    // FAX番号変更時はカイポケチェック
    if (field === 'fax_number' && typeof value === 'string') {
      onCheckKaipoke(value);
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '事業所名は必須です';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const result = await onSave({
      name: formData.name.trim(),
      name_kana: formData.name_kana.trim() || null,
      fax_number: formData.fax_number.trim() || null,
      notes: formData.notes.trim() || null,
      is_active: formData.is_active,
    });

    if (result.ok === true) {
      onClose();
    } else {
      setSubmitError(result.error || '保存に失敗しました');
    }
  };

  const handleClose = () => {
    onClearKaipokeCheck();
    onClose();
  };

  if (!isOpen) return null;

  const hasKaipokeWarning = kaipokeCheckResult.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* モーダル */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEditMode ? 'エントリ編集' : '新規登録'}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* 送信エラー */}
            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}

            {/* 事業所名 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                事業所名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm ${
                  errors.name ? 'border-red-400' : 'border-slate-300'
                }`}
                placeholder="例: さくら薬局 本店"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500">{errors.name}</p>
              )}
            </div>

            {/* 読み仮名 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                読み仮名
              </label>
              <input
                type="text"
                value={formData.name_kana}
                onChange={(e) => handleChange('name_kana', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="例: サクラヤッキョク ホンテン"
              />
            </div>

            {/* FAX番号 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                FAX番号
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.fax_number}
                  onChange={(e) => handleChange('fax_number', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  placeholder="例: 03-1234-5678"
                />
                {checkingKaipoke && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ハイフンありでも登録可能です（正規化は自動で行われます）
              </p>

              {/* カイポケ登録済み警告 */}
              {hasKaipokeWarning && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 mb-2">
                    <AlertCircle className="w-4 h-4" />
                    このFAX番号はカイポケに登録されています
                  </div>
                  <div className="space-y-1">
                    {kaipokeCheckResult.map((office) => (
                      <div
                        key={office.id}
                        className="p-2 bg-white/50 rounded text-xs"
                      >
                        <div className="font-medium text-amber-800">
                          {office.office_name}
                        </div>
                        <div className="text-amber-600 mt-0.5">
                          {office.service_type || '-'} / 事業者番号: {office.office_number || '-'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 備考 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                備考
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                placeholder="例: 福祉用具対応可"
              />
            </div>

            {/* 有効フラグ（編集時のみ） */}
            {isEditMode && (
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
            )}
          </div>

          {/* フッター */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-white transition-colors text-sm font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
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
