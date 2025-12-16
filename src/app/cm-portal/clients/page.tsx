// =============================================================
// src/app/cm-portal/clients/page.tsx
// 利用者情報一覧画面
// =============================================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CmCard } from '@/components/cm-components';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Users, AlertCircle } from 'lucide-react';
import { cmFormatAddress, cmCalculateAge, cmGetCareLevelStyle } from '@/lib/cm/utils';

// =============================================================
// 型定義
// =============================================================

type CmInsuranceInfo = {
  kaipoke_insurance_id: string;
  coverage_start: string;
  coverage_end: string;
  insurer_code: string;
  insurer_name: string | null;
  insured_number: string;
  care_level: string | null;
  cert_status: string | null;
};

type CmClientInfo = {
  id: string;
  kaipoke_cs_id: string;
  name: string;
  kana: string | null;
  gender: string | null;
  birth_date: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  town: string | null;
  building: string | null;
  phone_01: string | null;
  phone_02: string | null;
  client_status: string | null;
  contract_date: string | null;
  biko: string | null;
  is_active: boolean;
  insurances: CmInsuranceInfo[];
};

type CmPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

type CmApiResponse = {
  ok: boolean;
  clients?: CmClientInfo[];
  insurerOptions?: string[];
  pagination?: CmPagination;
  error?: string;
};

// =============================================================
// コンポーネント
// =============================================================

export default function CmClientsPage() {
  const router = useRouter();

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const [clients, setClients] = useState<CmClientInfo[]>([]);
  const [pagination, setPagination] = useState<CmPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 保険者リスト（APIから取得）
  const [insurerOptions, setInsurerOptions] = useState<string[]>([]);

  // フィルター（デフォルト：利用中）
  const [filters, setFilters] = useState({
    search: '',
    status: 'active',
    insurer: '',
  });

  const [page, setPage] = useState(1);

  // ---------------------------------------------------------
  // API 呼び出し
  // ---------------------------------------------------------
  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('page', String(page));

      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      if (filters.insurer) params.set('insurer', filters.insurer);

      const res = await fetch(`/api/cm/clients?${params.toString()}`, {
        credentials: 'include',
      });

      const data: CmApiResponse = await res.json();

      if (!data.ok) {
        setError(data.error || 'エラーが発生しました');
        setClients([]);
        setPagination(null);
        return;
      }

      setClients(data.clients || []);
      setPagination(data.pagination || null);

      // 保険者リストを更新（初回のみ or 毎回更新）
      if (data.insurerOptions && data.insurerOptions.length > 0) {
        setInsurerOptions(data.insurerOptions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラー');
      setClients([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // ---------------------------------------------------------
  // 初回読み込み & フィルター変更時
  // ---------------------------------------------------------
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // ---------------------------------------------------------
  // ハンドラー
  // ---------------------------------------------------------
  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const handleSearch = () => {
    setPage(1);
    fetchClients();
  };

  const handleReset = () => {
    setFilters({
      search: '',
      status: 'active',
      insurer: '',
    });
    setPage(1);
  };

  const handleSelectClient = (client: CmClientInfo) => {
    router.push(`/cm-portal/clients/${client.kaipoke_cs_id}`);
  };

  const isFiltered = filters.search !== '' || filters.status !== 'active' || filters.insurer !== '';

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">利用者情報一覧</h1>
          <p className="text-sm text-slate-500 mt-1">
            ケアマネジメント対象の利用者を管理します
          </p>
        </div>
        <button
          onClick={fetchClients}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <CmCard title="検索条件">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* 利用者名検索 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">利用者名</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="氏名・カナ・ふりがなで検索"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* ステータス */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">利用者状態</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              <option value="active">利用中</option>
              <option value="inactive">利用停止</option>
            </select>
          </div>

          {/* 保険者 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">保険者</label>
            <select
              value={filters.insurer}
              onChange={(e) => handleFilterChange('insurer', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">すべて</option>
              {insurerOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* ボタン */}
          <div className="flex items-end gap-2">
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
            >
              <Search className="w-4 h-4" />
              検索
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              リセット
            </button>
          </div>
        </div>
      </CmCard>

      {/* 件数表示 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600">
          {pagination ? (
            <>
              <span className="font-semibold text-slate-800">{pagination.total}</span> 件
            </>
          ) : (
            <span className="font-semibold text-slate-800">{clients.length}</span>
          )}
        </span>
        {isFiltered && (
          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-medium">
            フィルター適用中
          </span>
        )}
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* テーブル */}
      <CmCard noPadding>
        {loading ? (
          <div className="p-8 text-center text-slate-500">読み込み中...</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">該当する利用者がありません</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">氏名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">性別</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">生年月日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">要介護度</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">住所</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">電話番号</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">契約日</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状態</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {clients.map((client) => {
                  const currentInsurance = client.insurances?.[0];
                  const careLevel = currentInsurance?.care_level;
                  const age = cmCalculateAge(client.birth_date);

                  return (
                    <tr
                      key={client.id}
                      className="hover:bg-slate-50 cursor-pointer"
                      onClick={() => handleSelectClient(client)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{client.name}</div>
                        <div className="text-xs text-slate-400">{client.kana}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.gender ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-600">{client.birth_date ?? '-'}</div>
                        {age && <div className="text-xs text-slate-400">{age}歳</div>}
                      </td>
                      <td className="px-4 py-3">
                        {careLevel ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cmGetCareLevelStyle(careLevel)}`}>
                            {careLevel}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                        {cmFormatAddress(client) || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.phone_01 ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {client.contract_date ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          client.client_status === '利用中'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            client.client_status === '利用中' ? 'bg-green-500' : 'bg-slate-400'
                          }`} />
                          {client.client_status ?? '不明'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectClient(client);
                          }}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          詳細 →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ページネーション */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-500">
              全 {pagination.total} 件中 {(pagination.page - 1) * pagination.limit + 1} -{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} 件
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrev}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pagination.hasNext}
                className="p-2 border border-slate-300 rounded-lg hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </CmCard>
    </div>
  );
}