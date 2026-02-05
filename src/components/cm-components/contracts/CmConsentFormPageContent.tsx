// =============================================================
// src/components/cm-components/contracts/CmConsentFormPageContent.tsx
// 電子契約同意フォーム — コンテンツ
//
// 機能:
//   - 電子契約・録音同意のチェックボックス
//   - 立会職員（説明者）セレクト
//   - 署名者種別（本人 / 代理人）
//   - 代理人情報入力（続柄・理由はマスタから選択、「その他」入力対応）
//   - Canvas手書き署名
//   - uploadConsentPdf で PDF生成 → GDriveアップロード → DB登録
// =============================================================

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, AlertCircle, User, Eraser } from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { useRouter } from 'next/navigation';
import { getStaffList } from '@/lib/cm/contracts/getStaffList';
import type { CmStaffOption } from '@/lib/cm/contracts/getStaffList';
import { uploadConsentPdf } from '@/lib/cm/contracts/uploadConsentPdf';
import { getSelectOptionsMultiple } from '@/lib/cm/master/getSelectOptions';
import type { CmSelectOption } from '@/types/cm/selectOptions';
import { getSelectDisplayValue } from '@/types/cm/selectOptions';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
  clientName: string;
  clientAddress: string;
};

type SignerType = 'self' | 'proxy';

// =============================================================
// Component
// =============================================================

export function CmConsentFormPageContent({
  kaipokeCsId,
  clientName,
  clientAddress,
}: Props) {
  const router = useRouter();

  // ---------------------------------------------------------
  // 職員一覧
  // ---------------------------------------------------------
  const [staffList, setStaffList] = useState<CmStaffOption[]>([]);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------
  // 選択肢マスタ
  // ---------------------------------------------------------
  const [relationshipOptions, setRelationshipOptions] = useState<CmSelectOption[]>([]);
  const [proxyReasonOptions, setProxyReasonOptions] = useState<CmSelectOption[]>([]);

  // ---------------------------------------------------------
  // フォーム状態
  // ---------------------------------------------------------
  const [consentElectronic, setConsentElectronic] = useState(false);
  const [consentRecording, setConsentRecording] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [signerType, setSignerType] = useState<SignerType>('self');
  const [proxyName, setProxyName] = useState('');
  const [proxyRelationshipCode, setProxyRelationshipCode] = useState('');
  const [proxyRelationshipOther, setProxyRelationshipOther] = useState('');
  const [proxyReasonCode, setProxyReasonCode] = useState('');
  const [proxyReasonOther, setProxyReasonOther] = useState('');

  // ---------------------------------------------------------
  // 署名Canvas
  // ---------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // ---------------------------------------------------------
  // 送信状態
  // ---------------------------------------------------------
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // 選択肢が「その他」かどうか
  // ---------------------------------------------------------
  const isRelationshipOther = useCallback(() => {
    const opt = relationshipOptions.find((o) => o.code === proxyRelationshipCode);
    return opt?.requires_input ?? false;
  }, [relationshipOptions, proxyRelationshipCode]);

  const isProxyReasonOther = useCallback(() => {
    const opt = proxyReasonOptions.find((o) => o.code === proxyReasonCode);
    return opt?.requires_input ?? false;
  }, [proxyReasonOptions, proxyReasonCode]);

  // ---------------------------------------------------------
  // 初期データ取得
  // ---------------------------------------------------------
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [staffResult, optionsResult] = await Promise.all([
          getStaffList(),
          getSelectOptionsMultiple(['relationship', 'proxy_reason']),
        ]);

        if (staffResult.ok) {
          setStaffList(staffResult.data);
        }

        if (optionsResult.ok) {
          setRelationshipOptions(optionsResult.data.relationship || []);
          setProxyReasonOptions(optionsResult.data.proxy_reason || []);
        }
      } catch (e) {
        console.error('初期データ取得エラー', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // ---------------------------------------------------------
  // Canvas 初期化
  // ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 高解像度対応
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    // 背景を白に
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 線のスタイル
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [loading]);

  // ---------------------------------------------------------
  // 描画イベント
  // ---------------------------------------------------------
  const getCoordinates = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();

    const coords = getCoordinates(e);
    if (!coords) return;

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    setHasSignature(false);
  };

  // ---------------------------------------------------------
  // 署名画像取得
  // ---------------------------------------------------------
  const getSignatureBase64 = useCallback((): string | null => {
    if (!hasSignature) return null;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, [hasSignature]);

  // ---------------------------------------------------------
  // バリデーション
  // ---------------------------------------------------------
  const validate = useCallback((): string | null => {
    if (!consentElectronic) {
      return '電子契約への同意にチェックを入れてください';
    }
    if (!staffId) {
      return '立会職員を選択してください';
    }
    if (signerType === 'proxy') {
      if (!proxyName.trim()) {
        return '代筆者氏名を入力してください';
      }
      if (!proxyRelationshipCode) {
        return '本人との関係を選択してください';
      }
      // 「その他」選択時は入力必須
      if (isRelationshipOther() && !proxyRelationshipOther.trim()) {
        return '本人との関係（その他）を入力してください';
      }
      if (!proxyReasonCode) {
        return '代筆理由を選択してください';
      }
      // 「その他」選択時は入力必須
      if (isProxyReasonOther() && !proxyReasonOther.trim()) {
        return '代筆理由（その他）を入力してください';
      }
    }
    if (!hasSignature) {
      return '署名を入力してください';
    }
    return null;
  }, [
    consentElectronic,
    staffId,
    signerType,
    proxyName,
    proxyRelationshipCode,
    proxyRelationshipOther,
    proxyReasonCode,
    proxyReasonOther,
    hasSignature,
    isRelationshipOther,
    isProxyReasonOther,
  ]);

  // ---------------------------------------------------------
  // 送信
  // ---------------------------------------------------------
  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // 署名画像を取得
      const signatureBase64 = getSignatureBase64();
      if (!signatureBase64) {
        setError('署名を入力してください');
        return;
      }

      // 職員名を取得（PDFに含めるため）
      const selectedStaff = staffList.find((s) => s.user_id === staffId);
      const staffName = selectedStaff?.display_name || '';

      // 表示用の値を生成
      const relationshipDisplay =
        signerType === 'proxy'
          ? getSelectDisplayValue(
              proxyRelationshipCode,
              proxyRelationshipOther,
              relationshipOptions
            )
          : undefined;

      const reasonDisplay =
        signerType === 'proxy'
          ? getSelectDisplayValue(
              proxyReasonCode,
              proxyReasonOther,
              proxyReasonOptions
            )
          : undefined;

      // PDF生成 → GDriveアップロード → DB登録 を一括実行
      const result = await uploadConsentPdf({
        kaipokeCsId,
        clientName,
        clientAddress,
        consentElectronic,
        consentRecording,
        staffId,
        staffName,
        signerType,
        proxyName: signerType === 'proxy' ? proxyName.trim() : undefined,
        // 新カラム
        proxyRelationshipCode:
          signerType === 'proxy' ? proxyRelationshipCode : undefined,
        proxyRelationshipOther:
          signerType === 'proxy' ? proxyRelationshipOther.trim() || undefined : undefined,
        proxyReasonCode: signerType === 'proxy' ? proxyReasonCode : undefined,
        proxyReasonOther:
          signerType === 'proxy' ? proxyReasonOther.trim() || undefined : undefined,
        // PDF表示用（後方互換）
        proxyRelationship: relationshipDisplay,
        proxyReason: reasonDisplay,
        signatureBase64,
      });

      if (result.ok !== true) {
        setError(result.error || '同意の登録に失敗しました');
        return;
      }

      // 契約タブへ遷移
      router.push(`/cm-portal/clients/${kaipokeCsId}?tab=contracts`);
      router.refresh();
    } catch {
      setError('同意の登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------
  // 続柄変更時の処理
  // ---------------------------------------------------------
  const handleRelationshipChange = (code: string) => {
    setProxyRelationshipCode(code);
    // 「その他」以外を選んだらその他テキストをクリア
    const opt = relationshipOptions.find((o) => o.code === code);
    if (!opt?.requires_input) {
      setProxyRelationshipOther('');
    }
  };

  // ---------------------------------------------------------
  // 理由変更時の処理
  // ---------------------------------------------------------
  const handleReasonChange = (code: string) => {
    setProxyReasonCode(code);
    // 「その他」以外を選んだらその他テキストをクリア
    const opt = proxyReasonOptions.find((o) => o.code === code);
    if (!opt?.requires_input) {
      setProxyReasonOther('');
    }
  };

  // ---------------------------------------------------------
  // ローディング
  // ---------------------------------------------------------
  if (loading) {
    return (
      <CmCard>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          <span className="ml-2 text-slate-500">読み込み中...</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // 現在日時
  // ---------------------------------------------------------
  const now = new Date();
  const dateTimeStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="max-w-2xl">
      <CmCard
        title="電子契約に関する同意"
        footer={
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() =>
                router.push(`/cm-portal/clients/${kaipokeCsId}?tab=contracts`)
              }
              className="px-4 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 text-sm font-medium transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  処理中...
                </>
              ) : (
                '同意を完了する'
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* 説明 */}
          <p className="text-sm text-slate-600">
            以下の内容をご確認の上、同意をお願いいたします
          </p>

          {/* 利用者情報 */}
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg p-4">
            <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{clientName}</p>
              {clientAddress && (
                <p className="text-xs text-slate-500">{clientAddress}</p>
              )}
            </div>
          </div>

          {/* 同意日時 */}
          <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4">
            <span className="text-sm text-slate-500">同意日時</span>
            <span className="text-sm font-medium text-slate-800">
              {dateTimeStr}
            </span>
          </div>

          {/* 同意チェックボックス */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
              <input
                type="checkbox"
                checked={consentElectronic}
                onChange={(e) => setConsentElectronic(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-slate-300 accent-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  電子契約への同意
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  本契約および今後締結する契約について、電子署名により締結することに同意します
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
              <input
                type="checkbox"
                checked={consentRecording}
                onChange={(e) => setConsentRecording(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-slate-300 accent-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-800">
                  説明録音への同意
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  契約内容の説明時に、記録のため会話を録音することに同意します
                </p>
              </div>
            </label>
          </div>

          {/* 立会職員 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              立会職員（説明者） <span className="text-red-500">*</span>
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">選択してください</option>
              {staffList.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>

          {/* 署名者種別 */}
          <div className="border-t border-slate-200 pt-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">
              署名者 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="signer-type"
                  value="self"
                  checked={signerType === 'self'}
                  onChange={() => setSignerType('self')}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-slate-700">本人</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="signer-type"
                  value="proxy"
                  checked={signerType === 'proxy'}
                  onChange={() => setSignerType('proxy')}
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-sm text-slate-700">代理人</span>
              </label>
            </div>
          </div>

          {/* 代理人情報 */}
          {signerType === 'proxy' && (
            <div className="bg-amber-50 rounded-lg p-4 space-y-4 border border-amber-200">
              <p className="text-sm font-medium text-amber-800">代理人情報</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-700 mb-1">
                    代理人氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={proxyName}
                    onChange={(e) => setProxyName(e.target.value)}
                    placeholder="氏名を入力"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-700 mb-1">
                    本人との関係 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={proxyRelationshipCode}
                    onChange={(e) => handleRelationshipChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">選択</option>
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
                      value={proxyRelationshipOther}
                      onChange={(e) => setProxyRelationshipOther(e.target.value)}
                      placeholder="具体的に入力してください"
                      className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1">
                  代理署名の理由 <span className="text-red-500">*</span>
                </label>
                <select
                  value={proxyReasonCode}
                  onChange={(e) => handleReasonChange(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択</option>
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
                    value={proxyReasonOther}
                    onChange={(e) => setProxyReasonOther(e.target.value)}
                    placeholder="具体的に入力してください"
                    className="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                )}
              </div>
            </div>
          )}

          {/* 署名 Canvas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">
                署名 <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={clearSignature}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
              >
                <Eraser className="w-4 h-4" />
                クリア
              </button>
            </div>
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <canvas
                ref={canvasRef}
                className="w-full touch-none cursor-crosshair"
                style={{ height: '150px' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              上の欄に指またはマウスで署名してください
            </p>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </CmCard>
    </div>
  );
}