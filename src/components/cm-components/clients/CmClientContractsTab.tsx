// =============================================================
// src/components/cm-components/clients/CmClientContractsTab.tsx
// 利用者詳細 - 契約タブ
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Mic,
  Plus,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { getContracts } from '@/lib/cm/contracts/getContracts';
import type {
  CmContractListItem,
  CmContractConsent,
  CmContractStatus,
} from '@/types/cm/contract';
import {
  CM_CONTRACT_STATUS_LABELS,
  CM_CONTRACT_STATUS_COLORS,
} from '@/types/cm/contract';

// =============================================================
// Types
// =============================================================

type Props = {
  kaipokeCsId: string;
};

// =============================================================
// Component
// =============================================================

export function CmClientContractsTab({ kaipokeCsId }: Props) {
  const [consent, setConsent] = useState<CmContractConsent | null>(null);
  const [contracts, setContracts] = useState<CmContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getContracts(kaipokeCsId);

      if (result.ok === false) {
        setError(result.error || '契約情報の取得に失敗しました');
      } else {
        setConsent(result.data.consent);
        setContracts(result.data.contracts);
      }
    } catch {
      setError('契約情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kaipokeCsId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
  // エラー
  // ---------------------------------------------------------
  if (error) {
    return (
      <CmCard>
        <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </CmCard>
    );
  }

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      <ConsentStatusCard consent={consent} kaipokeCsId={kaipokeCsId} />
      <ContractListCard
        contracts={contracts}
        kaipokeCsId={kaipokeCsId}
        hasConsent={!!consent}
      />
    </div>
  );
}

// =============================================================
// 電子契約同意状況カード
// =============================================================

function ConsentStatusCard({
  consent,
  kaipokeCsId,
}: {
  consent: CmContractConsent | null;
  kaipokeCsId: string;
}) {
  if (consent) {
    return (
      <CmCard title="電子契約同意状況">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-6 flex-wrap">
            {consent.consent_electronic && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700">電子契約同意済み</p>
                  <p className="text-xs text-slate-500">{formatDateTime(consent.consented_at)}</p>
                </div>
              </div>
            )}
            {consent.consent_recording && (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Mic className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700">録音同意済み</p>
                  <p className="text-xs text-slate-500">{formatDateTime(consent.consented_at)}</p>
                </div>
              </div>
            )}
          </div>
          {/* PDF表示リンク */}
          {consent.gdrive_file_url && (
            <a
              href={consent.gdrive_file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
            >
              <FileText className="w-4 h-4" />
              同意書PDFを表示
            </a>
          )}
        </div>
      </CmCard>
    );
  }

  return (
    <CmCard title="電子契約同意状況">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-700">未同意</p>
            <p className="text-xs text-slate-500">署名前に同意の取得が必要です</p>
          </div>
        </div>
        <a
          href={`/cm-portal/clients/${kaipokeCsId}/consent`}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          同意を取得する →
        </a>
      </div>
    </CmCard>
  );
}

// =============================================================
// 契約一覧カード
// =============================================================

function ContractListCard({
  contracts,
  kaipokeCsId,
  hasConsent,
}: {
  contracts: CmContractListItem[];
  kaipokeCsId: string;
  hasConsent: boolean;
}) {
  return (
    <CmCard
      title="契約一覧"
      headerRight={
        <a
          href={`/cm-portal/clients/${kaipokeCsId}/contracts/create`}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          契約書類を作成
        </a>
      }
      noPadding
    >
      {contracts.length === 0 ? (
        <div className="text-center py-12 px-6">
          <p className="text-slate-500">契約がありません</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-6 py-3 font-medium">作成日</th>
                <th className="px-6 py-3 font-medium">書類</th>
                <th className="px-6 py-3 font-medium">状態</th>
                <th className="px-6 py-3 font-medium">本人確認</th>
                <th className="px-6 py-3 font-medium">録音</th>
                <th className="px-6 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((contract) => (
                <ContractRow
                  key={contract.id}
                  contract={contract}
                  kaipokeCsId={kaipokeCsId}
                  hasConsent={hasConsent}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CmCard>
  );
}

// =============================================================
// 契約行
// =============================================================

function ContractRow({
  contract,
  kaipokeCsId,
  hasConsent,
}: {
  contract: CmContractListItem;
  kaipokeCsId: string;
  hasConsent: boolean;
}) {
  const status = contract.status as CmContractStatus;
  const statusLabel = CM_CONTRACT_STATUS_LABELS[status] ?? status;
  const statusColor = CM_CONTRACT_STATUS_COLORS[status] ?? {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
  };

  const hasVerification = !!contract.verification_method_id;
  const hasPlaud = !!contract.plaud_recording_id;
  const canStartSigning = status === 'draft';

  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors">
      <td className="px-6 py-4 text-slate-700">{formatDate(contract.created_at)}</td>
      <td className="px-6 py-4 text-slate-600">{contract.document_count}点</td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor.bg} ${statusColor.text}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-6 py-4">
        {hasVerification ? (
          <span className="text-green-600 text-sm">✓ 入力済</span>
        ) : (
          <span className="text-slate-400 text-sm">未入力</span>
        )}
      </td>
      <td className="px-6 py-4">
        {hasPlaud ? (
          <span className="text-green-600 text-sm">✓ 紐付済</span>
        ) : (
          <span className="text-slate-400 text-sm">未登録</span>
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {canStartSigning && (
            <a
              href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}/sign`}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                hasConsent
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
              title={hasConsent ? '署名を開始' : '同意未取得（署名は開始できます）'}
            >
              署名開始
            </a>
          )}
          <a
            href={`/cm-portal/clients/${kaipokeCsId}/contracts/${contract.id}`}
            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
          >
            詳細
          </a>
        </div>
      </td>
    </tr>
  );
}

// =============================================================
// ヘルパー
// =============================================================

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}