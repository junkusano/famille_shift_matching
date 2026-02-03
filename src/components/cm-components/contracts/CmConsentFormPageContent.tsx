// =============================================================
// src/components/cm-components/contracts/CmConsentFormPageContent.tsx
// 電子契約同意フォーム — コンテンツ
//
// 機能:
//   - 電子契約・録音同意のチェックボックス
//   - 立会職員（説明者）セレクト
//   - 署名者種別（本人 / 代筆）
//   - 代筆者情報入力（代筆時のみ表示）
//   - Canvas手書き署名
//   - uploadConsentPdf で PDF生成 → GDriveアップロード → DB登録
// =============================================================

'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Loader2,
  AlertCircle,
  User,
  Eraser,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { useRouter } from 'next/navigation';
import { getStaffList } from '@/lib/cm/contracts/getStaffList';
import type { CmStaffOption } from '@/lib/cm/contracts/getStaffList';
import { uploadConsentPdf } from '@/lib/cm/contracts/uploadConsentPdf';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
  clientName: string;
  clientAddress: string;
};

type SignerType = 'self' | 'proxy';

const PROXY_RELATIONSHIP_OPTIONS = [
  '配偶者',
  '長男',
  '長女',
  '次男',
  '次女',
  'その他',
] as const;

const PROXY_REASON_OPTIONS = [
  '身体的理由により署名困難',
  '認知機能の低下により署名困難',
  'その他',
] as const;

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

  useEffect(() => {
    (async () => {
      try {
        const result = await getStaffList();
        if (result.ok === true) {
          setStaffList(result.data);
        }
      } catch {
        // ログのみ。ドロップダウンが空になるが致命的ではない
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------------------------------------------------------
  // フォーム状態
  // ---------------------------------------------------------
  const [consentElectronic, setConsentElectronic] = useState(false);
  const [consentRecording, setConsentRecording] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [signerType, setSignerType] = useState<SignerType>('self');
  const [proxyName, setProxyName] = useState('');
  const [proxyRelationship, setProxyRelationship] = useState('');
  const [proxyReason, setProxyReason] = useState('');

  // ---------------------------------------------------------
  // 送信状態
  // ---------------------------------------------------------
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // Canvas 署名
  // ---------------------------------------------------------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  /**
   * Canvas初期化
   * - 高DPIディスプレイ対応で内部サイズを拡大
   * - ctx.scale()は使わず、座標変換はgetCanvasCoordsで行う
   */
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // 内部サイズを表示サイズ × DPR に設定
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ctx.scale()は使わない（座標変換はgetCanvasCoordsで行う）
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2 * dpr; // DPR分だけ太くする
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    initCanvas();
    // ウィンドウリサイズ時にCanvasを再初期化
    window.addEventListener('resize', initCanvas);
    return () => window.removeEventListener('resize', initCanvas);
  }, [initCanvas]);

  /**
   * マウス/タッチ座標をCanvas内部座標に変換
   * 参考: https://note.affi-sapo-sv.com/js-canvas-click-coordinate.php
   *
   * 表示サイズ（CSS）と内部サイズ（canvas.width/height）の比率を
   * 毎回計算して変換することで、DPRやリサイズに対応
   */
  const getCanvasCoords = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();

      // 表示サイズと内部サイズの比率を計算
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX: number;
      let clientY: number;

      if ('touches' in e) {
        const touch = e.touches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }

      // ブラウザ上の座標をCanvas内部座標に変換
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      setIsDrawing(true);
      setHasSignature(true);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const { x, y } = getCanvasCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    },
    [getCanvasCoords]
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing) return;
      e.preventDefault();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const { x, y } = getCanvasCoords(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    },
    [isDrawing, getCanvasCoords]
  );

  const handlePointerUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  /**
   * 署名クリア
   * - 内部サイズ全体をクリア
   */
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 内部サイズ全体をクリア（canvas.width/heightを使用）
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // クリア後に線のスタイルを再設定
    const dpr = window.devicePixelRatio || 1;
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setHasSignature(false);
  }, []);

  const getSignatureBase64 = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return null;
    
    // 白背景付きのJPEG出力（透明部分を白に変換）
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return canvas.toDataURL('image/png');
    
    // 白背景を描画
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    // 署名を上に重ねる
    tempCtx.drawImage(canvas, 0, 0);
    
    // JPEG形式で出力（80%品質）
    return tempCanvas.toDataURL('image/jpeg', 0.8);
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
      if (!proxyRelationship) {
        return '本人との関係を選択してください';
      }
      if (!proxyReason) {
        return '代筆理由を選択してください';
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
    proxyRelationship,
    proxyReason,
    hasSignature,
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
        proxyRelationship: signerType === 'proxy' ? proxyRelationship : undefined,
        proxyReason: signerType === 'proxy' ? proxyReason : undefined,
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
                router.push(
                  `/cm-portal/clients/${kaipokeCsId}?tab=contracts`
                )
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
              <p className="text-sm font-medium text-slate-800">
                {clientName}
              </p>
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
              立会職員（説明者）{' '}
              <span className="text-red-500">*</span>
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
                <span className="text-sm text-slate-700">代筆</span>
              </label>
            </div>
          </div>

          {/* 代筆者情報 */}
          {signerType === 'proxy' && (
            <div className="bg-amber-50 rounded-lg p-4 space-y-4 border border-amber-200">
              <p className="text-sm font-medium text-amber-800">
                代筆者情報
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-700 mb-1">
                    代筆者氏名{' '}
                    <span className="text-red-500">*</span>
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
                    本人との関係{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={proxyRelationship}
                    onChange={(e) => setProxyRelationship(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">選択</option>
                    {PROXY_RELATIONSHIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-700 mb-1">
                  代筆理由 <span className="text-red-500">*</span>
                </label>
                <select
                  value={proxyReason}
                  onChange={(e) => setProxyReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">選択</option>
                  {PROXY_REASON_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 署名 Canvas */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-800">
                署名（手書き）
              </span>
              <button
                type="button"
                onClick={clearCanvas}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-red-600 transition-colors"
              >
                <Eraser className="w-3.5 h-3.5" />
                クリア
              </button>
            </div>
            <div className="relative border-2 border-dashed border-slate-300 rounded-lg bg-slate-50"
              style={{ height: '140px' }}
            >
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                style={{ touchAction: 'none' }}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-slate-400">
                    <p className="text-2xl">✍</p>
                    <p className="text-sm mt-1">ここに署名してください</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>
      </CmCard>
    </div>
  );
}