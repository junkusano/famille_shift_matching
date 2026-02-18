// =============================================================
// src/app/cm-portal/page.tsx
// CMポータル ダッシュボード（トップページ）
// =============================================================

'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { CmCard } from '@/components/cm-components';
import {
  Users,
  ClipboardCheck,
  FileText,
  Calculator,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ChevronRight,
  Clock,
  MapPin,
  Loader2,
} from 'lucide-react';
import { getAlerts, type CmAlertResponse, type CmAlertSummary } from '@/lib/cm/alerts/getAlerts';

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
const StatCard = ({
  title,
  value,
  subValue,
  icon: Icon,
  color,
  trend,
  alert,
  onClick,
  loading,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  color: string;
  trend?: string;
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
            {subValue && (
              <p className="text-xs text-slate-500 mt-0.5">{subValue}</p>
            )}
            {trend && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {trend}
              </p>
            )}
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
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}
      >
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
  </div>
);

// =============================================================
// 業務進捗バーコンポーネント
// =============================================================
const ProgressBar = ({
  label,
  current,
  total,
  color = 'bg-blue-500',
}: {
  label: string;
  current: number;
  total: number;
  color?: string;
}) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-800 font-medium">
          {current}/{total} ({percentage}%)
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// =============================================================
// アラートアイテムコンポーネント
// =============================================================
const AlertItem = ({
  alert,
  onAction,
}: {
  alert: CmAlert;
  onAction?: (alert: CmAlert) => void;
}) => {
  // アラートメッセージを生成
  const getMessage = () => {
    if (alert.category === 'insurance') {
      const days = alert.details.days_until_due ?? 0;
      if (alert.alert_type === 'expired') {
        return `被保険者証が${Math.abs(days)}日前に期限切れ`;
      } else {
        return `あと${days}日で被保険者証が期限切れ`;
      }
    } else if (alert.category === 'no_manager') {
      if (alert.alert_type === 'resigned') {
        return `担当ケアマネが退職済み（${alert.details.previous_manager_name ?? '不明'}）`;
      } else {
        return '担当ケアマネが未設定です';
      }
    }
    return '';
  };

  // サブメッセージを生成
  const getSubMessage = () => {
    if (alert.category === 'insurance' && alert.details.due_date) {
      return `有効期限: ${alert.details.due_date}`;
    }
    if (alert.category === 'no_manager' && alert.details.previous_manager_status) {
      return `ステータス: ${alert.details.previous_manager_status}`;
    }
    return undefined;
  };

  // アクションラベル
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
// 予定アイテムコンポーネント
// =============================================================
const ScheduleItem = ({
  time,
  clientName,
  type,
  location,
}: {
  time: string;
  clientName: string;
  type: string;
  location: string;
}) => {
  const typeStyles: Record<string, { bg: string; text: string }> = {
    'モニタリング': { bg: 'bg-green-100', text: 'text-green-700' },
    '担当者会議': { bg: 'bg-blue-100', text: 'text-blue-700' },
    '自宅訪問': { bg: 'bg-slate-100', text: 'text-slate-600' },
    '認定調査': { bg: 'bg-orange-100', text: 'text-orange-700' },
  };
  const style = typeStyles[type] || typeStyles['自宅訪問'];

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <div className="flex items-center gap-1 text-slate-400 w-14 flex-shrink-0">
        <Clock className="w-3 h-3" />
        <span className="text-xs">{time}</span>
      </div>
      <div className="flex-1 min-w-0 truncate text-slate-800">
        {clientName}
      </div>
      <span className={`px-1.5 py-0.5 rounded text-xs ${style.bg} ${style.text}`}>
        {type}
      </span>
      <div className="flex items-center gap-0.5 text-slate-400 text-xs flex-shrink-0">
        <MapPin className="w-3 h-3" />
        {location}
      </div>
    </div>
  );
};

// =============================================================
// メインコンポーネント
// =============================================================
async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

export default function CmPortalHome() {
  // アラートデータ
  const [alerts, setAlerts] = useState<CmAlert[]>([]);
  const [alertSummary, setAlertSummary] = useState<CmAlertSummary | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  // カテゴリフィルタ
  const [selectedCategory, setSelectedCategory] = useState<string>('すべて');

  // アラート取得（Server Action使用）
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setAlertsLoading(true);
        setAlertsError(null);

        // Server Actionを呼び出し
        const token = await getAccessToken();
        const result = await getAlerts({}, token);

        if (result.ok === false){
          throw new Error(result.error);
        }

        setAlerts((result.alerts ?? []) as CmAlert[]);
        setAlertSummary(result.summary ?? null);
      } catch (error) {
        console.error('アラート取得エラー:', error);
        setAlertsError(error instanceof Error ? error.message : 'エラーが発生しました');
      } finally {
        setAlertsLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  // フィルタされたアラート
  const filteredAlerts = alerts.filter((alert) => {
    if (selectedCategory === 'すべて') return true;
    if (selectedCategory === '被保険者証') return alert.category === 'insurance';
    if (selectedCategory === '担当者') return alert.category === 'no_manager';
    return true;
  });

  // 現在の日付を取得
  const today = new Date();
  const dateString = today.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  // サンプルデータ（実際はAPIから取得）
  const summaryData = {
    totalClients: 32,
    monitoring: { done: 8, total: 32 },
    usageTicketPending: 3,
    benefitPending: 8,
  };

  const schedules = {
    today: [
      { time: '10:00', clientName: '山田 太郎', type: 'モニタリング', location: '自宅' },
      { time: '14:00', clientName: '佐藤 花子', type: '担当者会議', location: '事業所' },
    ],
    tomorrow: [
      { time: '09:30', clientName: '田中 次郎', type: 'モニタリング', location: '自宅' },
      { time: '11:00', clientName: '鈴木 一郎', type: '自宅訪問', location: '自宅' },
      { time: '15:00', clientName: '高橋 五郎', type: '認定調査', location: '自宅' },
    ],
    dayAfter: [
      { time: '13:00', clientName: '高橋 五郎', type: 'モニタリング', location: '自宅' },
    ],
  };

  const notices = [
    { date: '12/17', type: '完了', title: '被保険者証アラートバッチ実行完了', sub: `新規アラート: ${alertSummary?.total ?? 0}件` },
    { date: '12/15', type: '重要', title: '年末年始の請求業務について', sub: '12/27までに給付管理を完了してください' },
    { date: '12/10', type: '新機能', title: 'ケアプラン作成補助機能を追加', sub: '' },
    { date: '12/05', type: 'info', title: 'システムメンテナンスのお知らせ', sub: '12/20 2:00-5:00' },
  ];

  const getNoticeStyle = (type: string) => {
    switch (type) {
      case '重要': return 'bg-red-100 text-red-700';
      case '完了': return 'bg-green-100 text-green-700';
      case '新機能': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  // 明日の日付
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowString = tomorrow.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

  // 明後日の日付
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const dayAfterString = dayAfter.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });

  // アラートアクション - 利用者詳細画面へ遷移
  const handleAlertAction = (alert: CmAlert) => {
    // アラート種類に応じてタブを決定
    let tab = 'insurance'; // デフォルトは被保険者証タブ
    
    if (alert.category === 'insurance') {
      tab = 'insurance';
    } else if (alert.category === 'no_manager') {
      tab = 'insurance'; // 担当者情報も被保険者証タブにある
    }

    // 利用者詳細画面へ遷移
    window.location.href = `/cm-portal/clients/${alert.kaipoke_cs_id}?tab=${tab}`;
  };

  // カテゴリフィルタ
  const categoryFilters = ['すべて', '被保険者証', '担当者'];

  return (
    <div className="space-y-4">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {dateString}
        </p>
      </div>

      {/* 統計カード - 4列で折り返し、xlで5列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <StatCard
          title="担当利用者"
          value={`${summaryData.totalClients}名`}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="モニタリング"
          value={`${summaryData.monitoring.done}/${summaryData.monitoring.total}`}
          subValue={`残り${summaryData.monitoring.total - summaryData.monitoring.done}件`}
          icon={ClipboardCheck}
          color="bg-green-500"
        />
        <StatCard
          title="利用票未作成"
          value={`${summaryData.usageTicketPending}件`}
          icon={FileText}
          color="bg-orange-500"
        />
        <StatCard
          title="給付管理未確定"
          value={`${summaryData.benefitPending}件`}
          icon={Calculator}
          color="bg-purple-500"
        />
        <StatCard
          title="業務アラート"
          value={alertsLoading ? '-' : `${alertSummary?.total ?? 0}件`}
          icon={AlertTriangle}
          color="bg-red-500"
          alert={alertSummary ? { critical: alertSummary.critical, warning: alertSummary.warning } : undefined}
          loading={alertsLoading}
        />
      </div>

      {/* メインコンテンツ - 2カラム */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 左カラム: 業務アラート */}
        <CmCard
          title="⚠️ 業務アラート"
          headerRight={
            <a
              href="/cm-portal/alerts"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              すべて見る
              <ChevronRight className="w-4 h-4" />
            </a>
          }
        >
          <div className="space-y-3">
            {/* カテゴリフィルタ */}
            <div className="flex flex-wrap gap-2 pb-3 border-b border-slate-100">
              {categoryFilters.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    cat === selectedCategory
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                  {cat === '被保険者証' && alertSummary && (
                    <span className="ml-1">
                      ({alertSummary.byCategory.insurance.critical + alertSummary.byCategory.insurance.warning})
                    </span>
                  )}
                  {cat === '担当者' && alertSummary && (
                    <span className="ml-1">
                      ({alertSummary.byCategory.no_manager.critical + alertSummary.byCategory.no_manager.warning})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* アラート一覧 */}
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
                filteredAlerts.slice(0, 10).map((alert) => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onAction={handleAlertAction}
                  />
                ))
              )}
            </div>
          </div>
        </CmCard>

        {/* 右カラム: 今週の予定 */}
        <CmCard
          title="📅 今週の予定"
          headerRight={
            <a
              href="/cm-portal/schedule"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              カレンダー
              <ChevronRight className="w-4 h-4" />
            </a>
          }
        >
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {/* 今日 */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-sm font-medium text-slate-800">
                  今日（{today.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}）
                </span>
              </div>
              <div className="ml-4 border-l-2 border-blue-200 pl-3">
                {schedules.today.length > 0 ? (
                  schedules.today.map((item, index) => (
                    <ScheduleItem key={index} {...item} />
                  ))
                ) : (
                  <p className="text-sm text-slate-400 py-2">予定なし</p>
                )}
              </div>
            </div>

            {/* 明日 */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-slate-300 rounded-full" />
                <span className="text-sm font-medium text-slate-600">{tomorrowString}</span>
              </div>
              <div className="ml-4 border-l-2 border-slate-200 pl-3">
                {schedules.tomorrow.length > 0 ? (
                  schedules.tomorrow.map((item, index) => (
                    <ScheduleItem key={index} {...item} />
                  ))
                ) : (
                  <p className="text-sm text-slate-400 py-2">予定なし</p>
                )}
              </div>
            </div>

            {/* 明後日 */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-slate-300 rounded-full" />
                <span className="text-sm font-medium text-slate-600">{dayAfterString}</span>
              </div>
              <div className="ml-4 border-l-2 border-slate-200 pl-3">
                {schedules.dayAfter.length > 0 ? (
                  schedules.dayAfter.map((item, index) => (
                    <ScheduleItem key={index} {...item} />
                  ))
                ) : (
                  <p className="text-sm text-slate-400 py-2">予定なし</p>
                )}
              </div>
            </div>
          </div>
        </CmCard>
      </div>

      {/* 下段 - 2カラム */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 今月の業務進捗 */}
        <CmCard
          title="📊 今月の業務進捗"
          headerRight={
            <span className="text-sm text-slate-500">
              {today.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}
            </span>
          }
        >
          <div className="space-y-3">
            <ProgressBar
              label="モニタリング実施"
              current={8}
              total={32}
              color="bg-green-500"
            />
            <ProgressBar
              label="利用票作成"
              current={29}
              total={32}
              color="bg-blue-500"
            />
            <ProgressBar
              label="提供票回収"
              current={20}
              total={32}
              color="bg-purple-500"
            />
            <ProgressBar
              label="給付管理確定"
              current={12}
              total={32}
              color="bg-orange-500"
            />

            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500">
                📈 先月比: モニタリング +3 / 利用票 +2 / 給付 -1
              </p>
            </div>
          </div>
        </CmCard>

        {/* お知らせ */}
        <CmCard
          title="📢 お知らせ"
          headerRight={
            <a
              href="/cm-portal/notices"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              すべて見る
              <ChevronRight className="w-4 h-4" />
            </a>
          }
        >
          <div className="space-y-2">
            {notices.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 pb-2 border-b border-slate-100 last:border-0 last:pb-0"
              >
                <div className="text-xs text-slate-400 w-10 flex-shrink-0 pt-0.5">
                  {item.date}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getNoticeStyle(item.type)}`}
                    >
                      {item.type}
                    </span>
                    <span className="text-sm text-slate-700">{item.title}</span>
                  </div>
                  {item.sub && (
                    <p className="text-xs text-slate-500 ml-0">{item.sub}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CmCard>
      </div>

      {/* クイックアクセス（モバイル用に下部に配置） */}
      <div className="lg:hidden">
        <CmCard title="クイックアクセス">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: '利用者一覧', href: '/cm-portal/clients', icon: Users },
              { label: 'スケジュール', href: '/cm-portal/schedule', icon: Calendar },
              { label: '利用票作成', href: '/cm-portal/usage-tickets', icon: FileText },
              { label: '給付管理', href: '/cm-portal/billing', icon: Calculator },
            ].map((item, index) => (
              <a
                key={index}
                href={item.href}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <item.icon className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </CmCard>
      </div>

      {/* フッター */}
      <div className="text-center text-xs text-slate-400 py-2">
        CMポータル（β版）
      </div>
    </div>
  );
}
