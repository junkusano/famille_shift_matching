// =============================================================
// src/app/cm-portal/page.tsx
// 居宅介護支援ポータル ホーム画面
//
// 本システムが管理しているデータのみ表示する。
// カイポケ側で管理している業務（モニタリング・利用票・給付管理・スケジュール）は
// 本システムにデータがないため表示しない。
// =============================================================
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import {
  Users,
  AlertTriangle,
  FileSignature,
  Mic,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useCmDisplayName } from '@/hooks/cm/users/useCmUser';
import { supabase } from '@/lib/supabaseClient';
import { getAlerts, type CmAlertResponse, type CmAlertSummary } from '@/lib/cm/alerts/getAlerts';
import {
  getHomeSummary,
  type CmHomeSummary,
  type CmHomeContractItem,
  type CmHomePlaudItem,
  type CmHomeActivityItem,
} from '@/lib/cm/home/getHomeSummary';

// =============================================================
// 型定義
// =============================================================

/** アラート型（Server Actionから取得） */
type CmAlert = CmAlertResponse & {
  details: {
    reference_id?: string;
    due_date?: string;
    days_until_due?: number;
    care_level?: string;
    care_manager_kaipoke_id?: string;
    previous_manager_name?: string;
    previous_manager_status?: string;
  };
};

// =============================================================
// 統計カードコンポーネント
// =============================================================
const CmHomeStatCard = ({
  title,
  value,
  icon: Icon,
  color,
  alert,
  onClick,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  alert?: { critical: number; warning: number };
  onClick?: () => void;
  loading?: boolean;
}) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
    onClick={onClick}
  >
    <div className="flex items-start justify-between">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 mb-1 truncate">{title}</p>
        {loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            <span className="text-sm text-slate-400">読込中...</span>
          </div>
        ) : (
          <>
            <p className="text-xl font-bold text-slate-800">{value}</p>
            {alert && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {alert.critical > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                    🔴 {alert.critical}
                  </span>
                )}
                {alert.warning > 0 && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                    🟡 {alert.warning}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

// =============================================================
// アラートアイテムコンポーネント
// =============================================================
const CmHomeAlertItem = ({
  alert,
  onAction,
}: {
  alert: CmAlert;
  onAction?: (alert: CmAlert) => void;
}) => {
  const getMessage = () => {
    if (alert.category === 'insurance') {
      const days = alert.details.days_until_due ?? 0;
      if (alert.alert_type === 'expired') {
        return `被保険者証が${Math.abs(days)}日前に期限切れ`;
      }
      return `あと${days}日で被保険者証が期限切れ`;
    }
    if (alert.category === 'no_manager') {
      if (alert.alert_type === 'resigned') {
        return `担当ケアマネが退職済み（${alert.details.previous_manager_name ?? '不明'}）`;
      }
      return '担当ケアマネが未設定です';
    }
    return '';
  };

  const getSubMessage = () => {
    if (alert.category === 'insurance' && alert.details.due_date) {
      return `有効期限: ${alert.details.due_date}`;
    }
    if (alert.category === 'no_manager' && alert.details.previous_manager_status) {
      return `ステータス: ${alert.details.previous_manager_status}`;
    }
    return undefined;
  };

  const getActionLabel = () => {
    if (alert.category === 'insurance') {
      return alert.alert_type === 'expired' ? '対応する' : '確認する';
    }
    return '担当を設定';
  };

  return (
    <div className={`p-2.5 rounded-lg border ${
      alert.severity === 'critical'
        ? 'bg-red-50 border-red-200'
        : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-base ${alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'}`}>
              {alert.severity === 'critical' ? '🔴' : '🟡'}
            </span>
            <span className="font-medium text-sm text-slate-800 truncate">{alert.client_name}</span>
            {alert.details.care_level && (
              <span className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-600">
                {alert.details.care_level}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 ml-6">{getMessage()}</p>
          {getSubMessage() && (
            <p className="text-xs text-slate-400 ml-6">{getSubMessage()}</p>
          )}
        </div>
        {onAction && (
          <button
            onClick={() => onAction(alert)}
            className="flex-shrink-0 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
          >
            {getActionLabel()}
          </button>
        )}
      </div>
    </div>
  );
};

// =============================================================
// アクティビティ行コンポーネント
// =============================================================
const CmHomeActivityRow = ({ item }: { item: CmHomeActivityItem }) => {
  const dotColor = {
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
    neutral: 'bg-slate-400',
  }[item.status];

  const iconEl = item.type === 'contract'
    ? <FileSignature className="w-3.5 h-3.5" />
    : <Mic className="w-3.5 h-3.5" />;

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
      <span className="text-slate-400 flex-shrink-0">{iconEl}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-slate-800">{item.action}</span>
        <span className="text-xs text-slate-500 ml-1.5 truncate">{item.detail}</span>
      </div>
      <span className="text-[10px] text-slate-400 flex-shrink-0">{item.time}</span>
    </div>
  );
};

// =============================================================
// 署名待ち契約行コンポーネント
// =============================================================
const CmHomeSigningRow = ({ item }: { item: CmHomeContractItem }) => {
  const dateStr = new Date(item.created_at).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });

  return (
    <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <span className="text-sm font-semibold text-slate-800">
            {item.client_name ?? '不明'}
          </span>
          <p className="text-xs text-slate-500 mt-0.5">
            書類 {item.document_count}点
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
            署名待ち
          </span>
          <p className="text-[10px] text-slate-400 mt-1">送信: {dateStr}</p>
        </div>
      </div>
    </div>
  );
};

// =============================================================
// Plaud行コンポーネント
// =============================================================
const CmHomePlaudRow = ({ item }: { item: CmHomePlaudItem }) => (
  <div className="flex items-center gap-2.5 p-2 rounded-lg bg-purple-50 border border-purple-200">
    <Mic className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <span className="text-xs font-semibold text-slate-800 truncate block">{item.title}</span>
      {item.client_name && (
        <span className="text-[10px] text-slate-500">{item.client_name}</span>
      )}
    </div>
    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 flex-shrink-0">
      承認待ち
    </span>
  </div>
);

// =============================================================
// 時間帯に応じた挨拶
// =============================================================
function cmGetGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'おはようございます';
  if (hour < 18) return 'こんにちは';
  return 'お疲れさまです';
}

// =============================================================
// メインコンポーネント
// =============================================================
export default function CmPortalHome() {
  const router = useRouter();
  const displayName = useCmDisplayName();

  // ---------------------------------------------------------
  // アラートデータ
  // ---------------------------------------------------------
  const [alerts, setAlerts] = useState<CmAlert[]>([]);
  const [alertSummary, setAlertSummary] = useState<CmAlertSummary | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('すべて');

  // ---------------------------------------------------------
  // ホームサマリーデータ
  // ---------------------------------------------------------
  const [summary, setSummary] = useState<CmHomeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // ---------------------------------------------------------
  // データ取得
  // ---------------------------------------------------------
  useEffect(() => {
    const fetchData = async () => {
      // トークン取得
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      // アラート取得
      try {
        setAlertsLoading(true);
        setAlertsError(null);

        const result = await getAlerts({}, token);

        if (result.ok === false) {
          setAlertsError(result.error);
        } else {
          setAlerts((result.alerts ?? []) as CmAlert[]);
          setAlertSummary(result.summary ?? null);
        }
      } catch (error) {
        console.error('アラート取得エラー:', error);
        setAlertsError(error instanceof Error ? error.message : 'エラーが発生しました');
      } finally {
        setAlertsLoading(false);
      }

      // ホームサマリー取得
      try {
        setSummaryLoading(true);

        const result = await getHomeSummary(token);

        if (result.ok === true) {
          setSummary(result.summary);
        }
      } catch (error) {
        console.error('サマリー取得エラー:', error);
      } finally {
        setSummaryLoading(false);
      }
    };

    fetchData();
  }, []);

  // ---------------------------------------------------------
  // フィルタされたアラート
  // ---------------------------------------------------------
  const filteredAlerts = alerts.filter((alert) => {
    if (selectedCategory === 'すべて') return true;
    if (selectedCategory === '被保険者証') return alert.category === 'insurance';
    if (selectedCategory === '担当者') return alert.category === 'no_manager';
    return true;
  });

  // ---------------------------------------------------------
  // 日付
  // ---------------------------------------------------------
  const today = new Date();
  const dateString = today.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // ---------------------------------------------------------
  // アラートアクション - 利用者詳細画面へ遷移
  // ---------------------------------------------------------
  const handleAlertAction = (alert: CmAlert) => {
    let tab = 'insurance';
    if (alert.category === 'insurance') {
      tab = 'insurance';
    } else if (alert.category === 'no_manager') {
      tab = 'insurance';
    }
    router.push(`/cm-portal/clients/${alert.kaipoke_cs_id}?tab=${tab}`);
  };

  const categoryFilters = ['すべて', '被保険者証', '担当者'];

  return (
    <div className="space-y-4">

      {/* ===== ページヘッダー: 挨拶 + クイックアクセス ===== */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {cmGetGreeting()}
            {displayName ? `、${displayName}さん` : ''}
          </h2>
          <p className="text-sm text-slate-500">{dateString}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/cm-portal/clients"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            利用者一覧
          </Link>
          <Link
            href="/cm-portal/plaud"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Mic className="w-3.5 h-3.5" />
            文字起こし
          </Link>
        </div>
      </div>

      {/* ===== 統計カード（本システムのデータのみ） ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CmHomeStatCard
          title="担当利用者"
          value={summaryLoading ? '-' : `${summary?.totalClients ?? 0}名`}
          icon={Users}
          color="bg-blue-500"
          loading={summaryLoading}
          onClick={() => router.push('/cm-portal/clients')}
        />
        <CmHomeStatCard
          title="業務アラート"
          value={alertsLoading ? '-' : `${alertSummary?.total ?? 0}件`}
          icon={AlertTriangle}
          color="bg-red-500"
          alert={alertSummary ? {
            critical: alertSummary.critical,
            warning: alertSummary.warning,
          } : undefined}
          loading={alertsLoading}
          onClick={() => router.push('/cm-portal/notifications/alerts')}
        />
        <CmHomeStatCard
          title="署名待ち契約"
          value={summaryLoading ? '-' : `${summary?.signingContracts ?? 0}件`}
          icon={FileSignature}
          color="bg-amber-500"
          loading={summaryLoading}
        />
        <CmHomeStatCard
          title="未処理Plaud"
          value={summaryLoading ? '-' : `${summary?.pendingPlaud ?? 0}件`}
          icon={Mic}
          color="bg-purple-500"
          loading={summaryLoading}
          onClick={() => router.push('/cm-portal/plaud')}
        />
      </div>

      {/* ===== 中段: アラート + 直近アクティビティ（2カラム） ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* アラートセクション */}
        <CmCard
          title="⚠️ 業務アラート"
          headerRight={
            <Link
              href="/cm-portal/notifications/alerts"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              すべて見る
              <ChevronRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-3">
            {/* カテゴリフィルタ */}
            <div className="flex gap-2">
              {categoryFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedCategory(filter)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedCategory === filter
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-slate-100 text-slate-600 border border-transparent hover:bg-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* アラートリスト */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {alertsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
                </div>
              ) : alertsError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-red-500">{alertsError}</p>
                </div>
              ) : filteredAlerts.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500">アラートはありません</p>
                </div>
              ) : (
                filteredAlerts.slice(0, 8).map((alert) => (
                  <CmHomeAlertItem
                    key={alert.id}
                    alert={alert}
                    onAction={handleAlertAction}
                  />
                ))
              )}
            </div>
          </div>
        </CmCard>

        {/* 直近アクティビティ */}
        <CmCard
          title="📋 直近のアクティビティ"
          headerRight={
            <span className="text-xs text-slate-400">本システム内の操作履歴</span>
          }
        >
          <div className="max-h-64 overflow-y-auto">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-500">読み込み中...</span>
              </div>
            ) : (summary?.recentActivity ?? []).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500">アクティビティはありません</p>
              </div>
            ) : (
              (summary?.recentActivity ?? []).map((item, index) => (
                <CmHomeActivityRow key={index} item={item} />
              ))
            )}
          </div>
        </CmCard>
      </div>

      {/* ===== 下段: 契約署名状況 + Plaud管理（2カラム） ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* 契約署名の状況 */}
        <CmCard
          title="✍️ 契約署名の状況"
          headerRight={
            <Link
              href="/cm-portal/clients"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              利用者一覧
              <ChevronRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-2">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (summary?.signingContractList ?? []).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500">署名待ちの契約はありません</p>
              </div>
            ) : (
              (summary?.signingContractList ?? []).map((item) => (
                <CmHomeSigningRow key={item.id} item={item} />
              ))
            )}
          </div>

          {/* サマリーフッター */}
          {!summaryLoading && summary && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-xs">
              <span className="text-slate-400">
                今月: <strong className="text-slate-700">{summary.contractsCompletedThisMonth}件</strong> 完了
              </span>
              <span className="text-slate-400">
                署名待ち: <strong className="text-amber-600">{summary.signingContracts}件</strong>
              </span>
              <span className="text-slate-400">
                下書き: <strong className="text-slate-500">{summary.draftContracts}件</strong>
              </span>
            </div>
          )}
        </CmCard>

        {/* 文字起こし管理 */}
        <CmCard
          title="🎙️ 文字起こし管理"
          headerRight={
            <Link
              href="/cm-portal/plaud"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Plaud管理
              <ChevronRight className="w-4 h-4" />
            </Link>
          }
        >
          <div className="space-y-2">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (summary?.pendingPlaudList ?? []).length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-slate-500">未処理の文字起こしはありません</p>
              </div>
            ) : (
              (summary?.pendingPlaudList ?? []).map((item) => (
                <CmHomePlaudRow key={item.id} item={item} />
              ))
            )}
          </div>

          {/* サマリーフッター */}
          {!summaryLoading && summary && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex gap-4 text-xs">
              <span className="text-slate-400">
                承認待ち: <strong className="text-purple-600">{summary.pendingPlaud}件</strong>
              </span>
              <span className="text-slate-400">
                今月処理済: <strong className="text-slate-700">{summary.plaudProcessedThisMonth}件</strong>
              </span>
            </div>
          )}
        </CmCard>
      </div>

      {/* フッター */}
      <div className="text-center text-xs text-slate-400 py-2">
        CMポータル（β版）
      </div>
    </div>
  );
}