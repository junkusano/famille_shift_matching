// =============================================================
// src/components/cm-components/clients/CmClientDetailHeader.tsx
// 利用者詳細 - ヘッダー
// =============================================================

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { cmCalculateAge } from '@/lib/cm/utils';
import type { CmClientDetail } from '@/types/cm/clientDetail';

type Props = {
  client: CmClientDetail;
  loading: boolean;
  onRefresh: () => void;
};

export function CmClientDetailHeader({ client, loading, onRefresh }: Props) {
  const router = useRouter();
  const age = cmCalculateAge(client.birth_date);

  const handleBack = () => {
    router.push('/cm-portal/clients');
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800">{client.name}</h1>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                client.client_status === '利用中'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  client.client_status === '利用中' ? 'bg-green-500' : 'bg-slate-400'
                }`}
              />
              {client.client_status ?? '不明'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {client.kana} {age && `・ ${age}歳`} {client.gender && `・ ${client.gender}`}
          </p>
        </div>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        更新
      </button>
    </div>
  );
}