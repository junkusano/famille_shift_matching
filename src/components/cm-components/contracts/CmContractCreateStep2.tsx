// =============================================================
// src/components/cm-components/contracts/CmContractCreateStep2.tsx
// 契約作成ウィザード Step2 - 差し込み情報確認 & プレビュー
//
// 機能:
//   - 利用者情報（DB自動入力）
//   - 署名者区分（本人 / 代理人）
//   - 代理人情報（続柄・理由はマスタから選択、「その他」入力対応）
//   - 後見人確認（任意）
//   - 契約日・担当者
//   - 書類プレビュー
//
// 変更履歴:
//   2026-02-05: officeInfo型を拡張（運営法人名・代表者名・管理者名を追加）
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  User,
  Users,
  Calendar,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  Shield,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { StepIndicator } from './CmContractCreateStep1';
import { CONTRACT_DOCUMENT_TEMPLATES } from '@/lib/cm/contracts/templates';
import { getTemplateByCode } from '@/lib/cm/contracts/templateActions';
import { getSelectOptionsMultiple } from '@/lib/cm/master/getSelectOptions';
import type {
  CmContractCreateStep1Data,
  CmContractCreateStep2Data,
  CmStaffSelectOption,
} from '@/types/cm/contractCreate';
import type { CmSelectOption } from '@/types/cm/selectOptions';
import { CM_GUARDIAN_TYPE_LABELS, getSelectDisplayValue } from '@/types/cm/selectOptions';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

// =============================================================
// Types
// =============================================================

type Props = {
  step1Data: CmContractCreateStep1Data;
  data: CmContractCreateStep2Data;
  staffList: CmStaffSelectOption[];
  officeInfo?: {
    name: string;
    address: string;
    phone: string;
    fax: string;
    corporation_name: string;
    representative_name: string;
    manager_name: string;
  } | null;
  onChange: (data: CmContractCreateStep2Data) => void;
  onBack: () => void;
  onNext: () => void;
};

// =============================================================
// Component
// =============================================================

export function CmContractCreateStep2({
  step1Data,
  data,
  staffList,
  officeInfo,
  onChange,
  onBack,
  onNext,
}: Props) {
  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<CmContractTemplateCode | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  // 選択肢マスタ
  const [relationshipOptions, setRelationshipOptions] = useState<CmSelectOption[]>([]);
  const [proxyReasonOptions, setProxyReasonOptions] = useState<CmSelectOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // ---------------------------------------------------------
  // 選択肢マスタ読み込み
  // ---------------------------------------------------------
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const result = await getSelectOptionsMultiple(['relationship', 'proxy_reason']);
        if (result.ok) {
          setRelationshipOptions(result.data.relationship || []);
          setProxyReasonOptions(result.data.proxy_reason || []);
        }
      } catch (e) {
        console.error('選択肢マスタ読み込みエラー', e);
      } finally {
        setLoadingOptions(false);
      }
    };
    loadOptions();
  }, []);

  // ---------------------------------------------------------
  // 入力ハンドラ
  // ---------------------------------------------------------
  const handleChange = (
    field: keyof CmContractCreateStep2Data,
    value: string | boolean
  ) => {
    const newData = { ...data, [field]: value };

    // 説明者選択時に名前も更新
    if (field === 'staffId') {
      const staff = staffList.find((s) => s.id === value);
      newData.staffName = staff?.name || '';
    }

    // 担当ケアマネ選択時に名前も更新
    if (field === 'careManagerId') {
      const staff = staffList.find((s) => s.id === value);
      newData.careManagerName = staff?.name || '';
    }

    // 署名者区分が本人に変わったら代理人情報をクリア
    if (field === 'signerType' && value === 'self') {
      newData.proxyName = '';
      newData.proxyRelationshipCode = '';
      newData.proxyRelationshipOther = '';
      newData.proxyReasonCode = '';
      newData.proxyReasonOther = '';
      newData.proxyAddress = '';
      newData.proxyPhone = '';
      newData.emergencyPhone = '';
    }

    // 続柄が「その他」以外に変わったらその他テキストをクリア
    if (field === 'proxyRelationshipCode') {
      const opt = relationshipOptions.find((o) => o.code === value);
      if (!opt?.requires_input) {
        newData.proxyRelationshipOther = '';
      }
    }

    // 理由が「その他」以外に変わったらその他テキストをクリア
    if (field === 'proxyReasonCode') {
      const opt = proxyReasonOptions.find((o) => o.code === value);
      if (!opt?.requires_input) {
        newData.proxyReasonOther = '';
      }
    }

    // 後見人なしに変わったら後見人情報をクリア
    if (field === 'hasGuardian' && value === false) {
      newData.guardianType = '';
      newData.guardianConfirmed = false;
      newData.guardianDocumentChecked = false;
      newData.guardianNotes = '';
    }

    onChange(newData);
  };

  // ---------------------------------------------------------
  // 選択肢が「その他」かどうか
  // ---------------------------------------------------------
  const isRelationshipOther = useCallback(() => {
    const opt = relationshipOptions.find((o) => o.code === data.proxyRelationshipCode);
    return opt?.requires_input ?? false;
  }, [relationshipOptions, data.proxyRelationshipCode]);

  const isProxyReasonOther = useCallback(() => {
    const opt = proxyReasonOptions.find((o) => o.code === data.proxyReasonCode);
    return opt?.requires_input ?? false;
  }, [proxyReasonOptions, data.proxyReasonCode]);

  // ---------------------------------------------------------
  // バリデーション
  // ---------------------------------------------------------
  const isValid =
    data.clientName.trim() !== '' &&
    data.contractDate !== '' &&
    data.staffId !== '' &&
    // 代理人の場合は追加バリデーション
    (data.signerType === 'self' ||
      (data.proxyName.trim() !== '' &&
        data.proxyRelationshipCode !== '' &&
        data.proxyReasonCode !== '' &&
        // 「その他」選択時は入力必須
        (!isRelationshipOther() || data.proxyRelationshipOther.trim() !== '') &&
        (!isProxyReasonOther() || data.proxyReasonOther.trim() !== '')));

  // ---------------------------------------------------------
  // 選択された書類
  // ---------------------------------------------------------
  const selectedTemplates = step1Data.selectedTemplates
    .map((code) => CONTRACT_DOCUMENT_TEMPLATES.find((t) => t.code === code))
    .filter((t): t is NonNullable<typeof t> => t != null);

  // ---------------------------------------------------------
  // タグ置換用データ
  // ---------------------------------------------------------
  const getTagReplacements = useCallback((): Record<string, string> => {
    const formatDate = (dateStr: string): string => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    };

    // 続柄の表示値
    const relationshipDisplay = getSelectDisplayValue(
      data.proxyRelationshipCode,
      data.proxyRelationshipOther,
      relationshipOptions
    );

    // 理由の表示値
    const reasonDisplay = getSelectDisplayValue(
      data.proxyReasonCode,
      data.proxyReasonOther,
      proxyReasonOptions
    );

    // 事業所情報のフォールバック
    const office = officeInfo ?? {
      name: '',
      address: '',
      phone: '',
      fax: '',
      corporation_name: '',
      representative_name: '',
      manager_name: '',
    };

    return {
      '{{利用者氏名}}': data.clientName,
      '{{利用者住所}}': data.clientAddress,
      '{{利用者電話}}': data.clientPhone,
      '{{利用者FAX}}': data.clientFax,
      '{{代筆者氏名}}': data.proxyName,
      '{{代筆者続柄}}': relationshipDisplay,
      '{{代筆理由}}': reasonDisplay,
      '{{代筆者住所}}': data.proxyAddress,
      '{{代筆者電話}}': data.proxyPhone,
      '{{代筆者FAX}}': '',
      '{{緊急連絡先電話}}': data.emergencyPhone,
      '{{契約日}}': formatDate(data.contractDate),
      '{{同意日}}': formatDate(data.contractDate),
      '{{説明日}}': formatDate(data.contractDate),
      '{{契約開始日}}': formatDate(data.contractStartDate),
      '{{契約終了日}}': formatDate(data.contractEndDate),
      '{{説明者氏名}}': data.staffName,
      '{{担当者氏名}}': data.careManagerName,
      '{{担当者電話}}': data.careManagerPhone,
      '{{担当期間}}': data.careManagerPeriod,
      '{{事業所名}}': office.name,
      '{{事業所住所}}': office.address,
      '{{事業所電話}}': office.phone,
      '{{事業所FAX}}': office.fax,
      '{{運営法人名}}': office.corporation_name,
      '{{代表者名}}': office.representative_name,
      '{{管理者名}}': office.manager_name,
    };
  }, [data, officeInfo, relationshipOptions, proxyReasonOptions]);

  // ---------------------------------------------------------
  // プレビュー読み込み
  // ---------------------------------------------------------
  const loadPreview = useCallback(
    async (code: CmContractTemplateCode) => {
      setLoadingPreview(true);
      setPreviewTemplate(code);

      try {
        const result = await getTemplateByCode(code);
        if (result.ok && result.data) {
          let html = result.data.html_content;

          // タグを置換
          const replacements = getTagReplacements();
          for (const [tag, value] of Object.entries(replacements)) {
            html = html.replaceAll(
              tag,
              value || `<span style="color:#999;">${tag}</span>`
            );
          }

          // DigiSignerタグを視覚化
          html = html.replace(
            /\[s:(\w+)\s+\]/g,
            '<div style="border:2px dashed #3b82f6;background:#eff6ff;padding:20px;text-align:center;color:#3b82f6;margin:10px 0;">✍ 署名欄 [$1]</div>'
          );
          html = html.replace(
            /\[d:(\w+)\s+\]/g,
            '<span style="border:2px dashed #f59e0b;background:#fefce8;padding:8px 16px;display:inline-block;color:#b45309;margin:5px 0;">📅 日付欄 [$1]</span>'
          );
          html = html.replace(
            /\[c:(\w+)\]/g,
            '<span style="background:#fef3c7;color:#92400e;padding:2px 4px;border-radius:4px;">☐</span>'
          );

          setPreviewHtml(html);
        }
      } catch (e) {
        console.error('プレビュー読み込みエラー', e);
      } finally {
        setLoadingPreview(false);
      }
    },
    [getTagReplacements]
  );

  // 初回プレビュー
  useEffect(() => {
    if (showPreview && !previewTemplate && selectedTemplates.length > 0) {
      loadPreview(selectedTemplates[0].code);
    }
  }, [showPreview, previewTemplate, selectedTemplates, loadPreview]);

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ステップインジケーター */}
      <StepIndicator current={2} />

      <CmCard
        title="差し込み情報の確認"
        footer={
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
            >
              ← 戻る
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!isValid}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              次へ →
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-500 mb-6">
          利用者情報から自動入力されています。必要に応じて編集してください。
        </p>

        <div className="space-y-6">
          {/* ===== 1. 利用者情報 ===== */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                1
              </span>
              <User className="w-4 h-4 text-slate-400" />
              利用者情報
              <span className="ml-2 text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">
                DBから自動入力
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  氏名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={data.clientName}
                  onChange={(e) => handleChange('clientName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">電話番号</label>
                <input
                  type="text"
                  value={data.clientPhone}
                  onChange={(e) => handleChange('clientPhone', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">住所</label>
                <input
                  type="text"
                  value={data.clientAddress}
                  onChange={(e) => handleChange('clientAddress', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">FAX</label>
                <input
                  type="text"
                  value={data.clientFax}
                  onChange={(e) => handleChange('clientFax', e.target.value)}
                  placeholder="（任意）"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* ===== 2. 署名者区分 ===== */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs">
                2
              </span>
              <Users className="w-4 h-4 text-slate-400" />
              署名者
            </h3>

            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="signerType"
                    value="self"
                    checked={data.signerType === 'self'}
                    onChange={() => handleChange('signerType', 'self')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">本人</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="signerType"
                    value="proxy"
                    checked={data.signerType === 'proxy'}
                    onChange={() => handleChange('signerType', 'proxy')}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">代理人</span>
                </label>
              </div>

              {/* 代理人情報（代理人選択時のみ表示） */}
              {data.signerType === 'proxy' && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                  {loadingOptions ? (
                    <p className="text-sm text-slate-500">選択肢を読み込み中...</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            代理人氏名 <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={data.proxyName}
                            onChange={(e) => handleChange('proxyName', e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            本人との関係 <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={data.proxyRelationshipCode}
                            onChange={(e) =>
                              handleChange('proxyRelationshipCode', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">選択してください</option>
                            {relationshipOptions.map((opt) => (
                              <option key={opt.code} value={opt.code}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          {/* 「その他」選択時の入力欄 */}
                          {isRelationshipOther() && (
                            <input
                              type="text"
                              value={data.proxyRelationshipOther}
                              onChange={(e) =>
                                handleChange('proxyRelationshipOther', e.target.value)
                              }
                              placeholder="具体的に入力してください"
                              className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-slate-500 mb-1">
                          代理署名の理由 <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={data.proxyReasonCode}
                          onChange={(e) =>
                            handleChange('proxyReasonCode', e.target.value)
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">選択してください</option>
                          {proxyReasonOptions.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {/* 「その他」選択時の入力欄 */}
                        {isProxyReasonOther() && (
                          <input
                            type="text"
                            value={data.proxyReasonOther}
                            onChange={(e) =>
                              handleChange('proxyReasonOther', e.target.value)
                            }
                            placeholder="具体的に入力してください"
                            className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-xs text-slate-500 mb-1">
                            代理人住所
                          </label>
                          <input
                            type="text"
                            value={data.proxyAddress}
                            onChange={(e) =>
                              handleChange('proxyAddress', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            代理人電話番号
                          </label>
                          <input
                            type="text"
                            value={data.proxyPhone}
                            onChange={(e) =>
                              handleChange('proxyPhone', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">
                            緊急連絡先電話番号
                          </label>
                          <input
                            type="text"
                            value={data.emergencyPhone}
                            onChange={(e) =>
                              handleChange('emergencyPhone', e.target.value)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ===== 3. 後見人確認（任意） ===== */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-xs">
                3
              </span>
              <Shield className="w-4 h-4 text-slate-400" />
              後見人確認
              <span className="ml-2 text-xs text-slate-500">（任意）</span>
            </h3>

            <div className="bg-slate-50 p-4 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.hasGuardian}
                  onChange={(e) => handleChange('hasGuardian', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">後見人等である</span>
              </label>

              {data.hasGuardian && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                  {/* 種別 */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-2">種別</label>
                    <div className="flex flex-wrap gap-4">
                      {(
                        Object.entries(CM_GUARDIAN_TYPE_LABELS) as [
                          'legal' | 'curator' | 'assistant',
                          string
                        ][]
                      ).map(([type, label]) => (
                        <label
                          key={type}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="radio"
                            name="guardianType"
                            value={type}
                            checked={data.guardianType === type}
                            onChange={() => handleChange('guardianType', type)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* 確認チェック */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.guardianConfirmed}
                        onChange={(e) =>
                          handleChange('guardianConfirmed', e.target.checked)
                        }
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">
                        後見人等であることを確認した
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={data.guardianDocumentChecked}
                        onChange={(e) =>
                          handleChange('guardianDocumentChecked', e.target.checked)
                        }
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">
                        登記事項証明書等を確認した
                      </span>
                    </label>
                  </div>

                  {/* 備考 */}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      備考（確認日、確認方法など）
                    </label>
                    <textarea
                      value={data.guardianNotes}
                      onChange={(e) => handleChange('guardianNotes', e.target.value)}
                      rows={2}
                      placeholder="例: 2026/2/4 登記事項証明書コピー受領"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ===== 4. 契約日・担当者 ===== */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xs">
                4
              </span>
              <Calendar className="w-4 h-4 text-slate-400" />
              契約日・担当者
              <span className="ml-2 text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded">
                要選択
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg">
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  契約日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={data.contractDate}
                  onChange={(e) => handleChange('contractDate', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">契約開始日</label>
                <input
                  type="date"
                  value={data.contractStartDate}
                  onChange={(e) => handleChange('contractStartDate', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">契約終了日</label>
                <input
                  type="date"
                  value={data.contractEndDate}
                  onChange={(e) => handleChange('contractEndDate', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  説明者 <span className="text-red-500">*</span>
                </label>
                <select
                  value={data.staffId}
                  onChange={(e) => handleChange('staffId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択してください</option>
                  {staffList.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">担当ケアマネ</label>
                <select
                  value={data.careManagerId}
                  onChange={(e) => handleChange('careManagerId', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択してください</option>
                  {staffList.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">担当期間</label>
                <input
                  type="text"
                  value={data.careManagerPeriod}
                  onChange={(e) => handleChange('careManagerPeriod', e.target.value)}
                  placeholder="例: 2026年2月3日〜"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* ===== 作成書類 & プレビュー ===== */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              作成書類
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <Eye className="w-4 h-4" />
                {showPreview ? 'プレビューを閉じる' : 'プレビューを表示'}
                {showPreview ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            </h3>

            {/* 書類タブ */}
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedTemplates.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => {
                    if (showPreview) {
                      loadPreview(t.code);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    previewTemplate === t.code && showPreview
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>

            {/* プレビュー表示 */}
            {showPreview && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">
                    プレビュー:{' '}
                    {selectedTemplates.find((t) => t.code === previewTemplate)?.name}
                  </span>
                  {loadingPreview && (
                    <span className="text-xs text-slate-500">読み込み中...</span>
                  )}
                </div>
                <div
                  className="p-6 bg-white max-h-96 overflow-y-auto"
                  style={{
                    fontFamily: '"Yu Mincho", "游明朝", serif',
                    fontSize: '12px',
                    lineHeight: '1.8',
                  }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            )}
          </section>
        </div>
      </CmCard>
    </div>
  );
}