// =============================================================
// src/components/cm-components/contracts/CmContractDetailPageContent.tsx
// 契約詳細 - メインコンテンツ
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Mic,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { CmCard } from '@/components/cm-components';
import { getContractDetail } from '@/lib/cm/contracts/getContractDetail';
import type {
  CmContractDetailData,
  CmContractStatus,
  CmDocumentSigningStatus,
} from '@/types/cm/contract';
import {
  CM_CONTRACT_STATUS_LABELS,
  CM_CONTRACT_STATUS_COLORS,
  CM_CONTRACT_TYPE_LABELS,
} from '@/types/cm/contract';

// =============================================================
// Types
// =============================================================

type Props = {
  contractId: string;
};

// =============================================================
// Component
// =============================================================

export function CmContractDetailPageContent({ contractId }: Props) {
  const [data, setData] = useState<CmContractDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getContractDetail(contractId);
      if (result.ok === true) {
        setData(result.data);
      } else {
        setError(result.error || '契約情報の取得に失敗しました');
      }
    } catch {
      setError('契約情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

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

  if (error || !data) {
    return (
      <CmCard>
        <div className="flex items-center gap-2 text-red-600 py-8 justify-center">
          <AlertCircle className="w-5 h-5" />
          <span>{error || '不明なエラー'}</span>
        </div>
      </CmCard>
    );
  }

  const { contract, documents, consent, plaudRecording } = data;
  const status = contract.status as CmContractStatus;
  const statusLabel = CM_CONTRACT_STATUS_LABELS[status] ?? contract.status;
  const statusColor = CM_CONTRACT_STATUS_COLORS[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };
  const typeLabel = CM_CONTRACT_TYPE_LABELS[contract.contract_type] ?? contract.contract_type;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <CmCard>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {contract.client_name || ''} の契約
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {typeLabel} ・ {contract.signing_method === 'paper' ? '紙契約' : '電子契約'}
            </p>
          </div>
          <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${statusColor.bg} ${statusColor.text}`}>
            {statusLabel}
          </span>
        </div>
      </CmCard>

      {/* 契約基本情報 */}
      <CmCard title="契約情報">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <InfoRow label="契約日" value={formatDate(contract.contract_date)} />
          <InfoRow label="担当職員" value={contract.staff_name || '—'} />
          <InfoRow label="契約種別" value={typeLabel} />
          <InfoRow label="契約方式" value={contract.signing_method === 'paper' ? '紙' : '電子'} />
          <InfoRow label="作成日時" value={formatDateTime(contract.created_at)} />
          {contract.signed_at && <InfoRow label="署名完了日時" value={formatDateTime(contract.signed_at)} />}
          {contract.completed_at && <InfoRow label="完了日時" value={formatDateTime(contract.completed_at)} />}
          {contract.notes && (
            <div className="md:col-span-2">
              <InfoRow label="備考" value={contract.notes} />
            </div>
          )}
        </div>
      </CmCard>

      {/* 書類一覧 */}
      <CmCard title="書類一覧" noPadding>
        {documents.length === 0 ? (
          <div className="text-center py-8 text-slate-500">書類がありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 font-medium">書類名</th>
                  <th className="px-6 py-3 font-medium">署名状態</th>
                  <th className="px-6 py-3 font-medium">DigiSigner</th>
                  <th className="px-6 py-3 font-medium">Google Drive</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-700">{doc.document_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <SigningStatusBadge status={doc.signing_status} />
                    </td>
                    <td className="px-6 py-4">
                      {doc.signing_url ? (
                        <a href={doc.signing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                          <ExternalLink className="w-3 h-3" />署名URL
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {doc.gdrive_file_url ? (
                        <a href={doc.gdrive_file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                          <ExternalLink className="w-3 h-3" />Drive で開く
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CmCard>

      {/* 本人確認 */}
      <CmCard title="本人確認">
        {contract.verification_method_id ? (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm space-y-1">
              <p className="text-slate-700">確認方法: <span className="font-medium">{contract.verification_method_name || '—'}</span></p>
              <p className="text-slate-700">
                確認書類: <span className="font-medium">
                  {contract.verification_document_name || '—'}
                  {contract.verification_document_other && ` (${contract.verification_document_other})`}
                </span>
              </p>
              {contract.verification_at && (
                <p className="text-slate-500">確認日時: {formatDateTime(contract.verification_at)}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-slate-500">
            <Clock className="w-5 h-5" />
            <span className="text-sm">未入力</span>
          </div>
        )}
      </CmCard>

      {/* 録音 */}
      <CmCard title="録音">
        {plaudRecording ? (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Mic className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm space-y-1">
              <p className="text-slate-700 font-medium">{plaudRecording.title}</p>
              <p className="text-slate-500">録音日時: {formatDateTime(plaudRecording.plaud_created_at)}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-slate-500">
            <Mic className="w-5 h-5" />
            <span className="text-sm">未登録</span>
          </div>
        )}
      </CmCard>

      {/* 同意情報 */}
      {consent && (
        <CmCard title="電子契約同意">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-sm space-y-1">
              <p className="text-slate-700">
                署名者: <span className="font-medium">
                  {consent.signer_type === 'proxy'
                    ? `代理人 (${consent.proxy_name} / ${consent.proxy_relationship})`
                    : '本人'}
                </span>
              </p>
              <p className="text-slate-500">同意日時: {formatDateTime(consent.consented_at)}</p>
              {consent.gdrive_file_url && (
                <a href={consent.gdrive_file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs mt-1">
                  <ExternalLink className="w-3 h-3" />署名画像を表示
                </a>
              )}
            </div>
          </div>
        </CmCard>
      )}
    </div>
  );
}

// =============================================================
// サブコンポーネント
// =============================================================

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800 font-medium mt-0.5">{value || '—'}</dd>
    </div>
  );
}

function SigningStatusBadge({ status }: { status: CmDocumentSigningStatus }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    pending:  { bg: 'bg-slate-100',  text: 'text-slate-600',  label: '未送信' },
    sent:     { bg: 'bg-amber-100',  text: 'text-amber-700',  label: '送信済' },
    signed:   { bg: 'bg-green-100',  text: 'text-green-700',  label: '署名済' },
    declined: { bg: 'bg-red-100',    text: 'text-red-700',    label: '辞退' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// =============================================================
// ヘルパー
// =============================================================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}