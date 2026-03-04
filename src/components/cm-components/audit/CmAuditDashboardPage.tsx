// =============================================================
// src/components/cm-components/audit/CmAuditDashboardPage.tsx
// 監査ダッシュボード（ハブ）の Client Component
// /cm-portal/audit のメインコンテンツ
//
// 旧 CmAuditDashboard.tsx（モックデータ）を実データ接続に置き換え。
// デザイン・レイアウト・CSSクラスは旧版を完全踏襲。
//
// データ取得:
//   cmGetTimeline で当日のタイムラインを取得し、
//   サマリー・チャート・テーブル・ヒートマップを描画する。
// =============================================================

'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users,
  Zap,
  RefreshCw,
  Eye,
  LayoutDashboard,
  List,
  GitBranch,
  Terminal,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Filter,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { supabase } from '@/lib/supabaseClient';
import { cmGetTimeline } from '@/lib/cm/audit/getTimeline';
import type {
  CmAuditLogFilter,
  CmAuditSession,
  CmTimelineEvent,
} from '@/types/cm/operationLog';
import styles from '@/styles/cm-styles/components/auditDashboard.module.css';

// =============================================================
// 型定義
// =============================================================

type CmAuditColorSet = {
  main: string;
  light: string;
  muted: string;
};

type CmAuditSeverity = 'high' | 'medium' | 'low';

type CmAuditPeriod = 'today' | '7d' | '30d';

type CmAuditUserStat = {
  name: string;
  userId: string;
  operations: number;
  pageViews: number;
  lastAccess: string;
  changes: number;
};

type CmAuditImportantOp = {
  time: string;
  user: string;
  action: string;
  target: string;
  severity: CmAuditSeverity;
};

type CmAuditHeatmapCell = {
  day: string;
  dayIndex: number;
  hour: number;
  count: number;
};

// =============================================================
// カラーパレット（旧版と同一）
// =============================================================

const CM_AUDIT_PALETTE: Record<string, CmAuditColorSet> = {
  blue:    { main: '#2563eb', light: '#dbeafe', muted: '#93bbfd' },
  violet:  { main: '#7c3aed', light: '#ede9fe', muted: '#b4a0f4' },
  cyan:    { main: '#0891b2', light: '#cffafe', muted: '#67d9ef' },
  emerald: { main: '#059669', light: '#d1fae5', muted: '#6ee7b7' },
  amber:   { main: '#d97706', light: '#fef3c7', muted: '#fbbf24' },
};

// severity スタイル
const CM_AUDIT_SEVERITY_STYLES: Record<CmAuditSeverity, {
  bg: string;
  border: string;
  dot: string;
  text: string;
}> = {
  high:   { bg: '#fef2f2', border: '#fecaca', dot: '#ef4444', text: '#b91c1c' },
  medium: { bg: '#fffbeb', border: '#fed7aa', dot: '#f59e0b', text: '#b45309' },
  low:    { bg: '#ffffff', border: '#e2e8f0', dot: '#cbd5e1', text: '#64748b' },
};

// 高重要度アクションのキーワード
const CM_AUDIT_HIGH_SEVERITY_ACTIONS = ['delete', 'remove', 'destroy'];
const CM_AUDIT_MEDIUM_SEVERITY_ACTIONS = ['create', 'insert', 'batch', 'execute', 'rpa', 'update'];

// カテゴリラベルマップ
const CM_AUDIT_CATEGORY_LABELS: Record<string, string> = {
  client: '利用者',
  contract: '契約',
  fax: 'FAX',
  phonebook: 'FAX電話帳',
  'other-office': '他事業所',
  schedule: 'スケジュール',
  credential: '認証情報',
  'rpa-api': 'RPA API',
  'rpa-job': 'RPAジョブ',
  'alert-batch': 'アラートバッチ',
  plaud: 'Plaud',
  master: 'マスタ',
};

// カテゴリごとのカラー
const CM_AUDIT_CATEGORY_COLORS: Record<string, string> = {
  client: CM_AUDIT_PALETTE.blue.main,
  contract: CM_AUDIT_PALETTE.violet.main,
  fax: CM_AUDIT_PALETTE.cyan.main,
  'rpa-api': CM_AUDIT_PALETTE.amber.main,
  'rpa-job': CM_AUDIT_PALETTE.amber.main,
  master: CM_AUDIT_PALETTE.emerald.main,
};

const CM_AUDIT_DEFAULT_CATEGORY_COLOR = '#94a3b8';

// =============================================================
// ユーティリティ
// =============================================================

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/** 指定日数前の00:00:00をISO文字列で返す */
function cmAuditDaysAgoStart(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** セッションからユーザー表示名 */
function cmAuditSessionDisplayName(session: CmAuditSession): string {
  if (session.user_name) return session.user_name;
  if (session.user_email) return session.user_email.split('@')[0];
  return session.user_id.slice(0, 8);
}

/** イベントからユーザー表示名 */
function cmAuditDisplayName(event: CmTimelineEvent): string {
  if (event.user_name) return event.user_name;
  if (event.user_email) return event.user_email.split('@')[0];
  return event.user_id.slice(0, 8);
}

/** 時刻フォーマット HH:mm */
function cmAuditFormatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

/** アクションのseverity判定 */
function cmAuditGetSeverity(action: string): CmAuditSeverity {
  const lower = action.toLowerCase();
  if (CM_AUDIT_HIGH_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return 'high';
  if (CM_AUDIT_MEDIUM_SEVERITY_ACTIONS.some((k) => lower.includes(k))) return 'medium';
  return 'low';
}

/** ヒートマップカラー算出 */
function cmAuditHeatmapColor(intensity: number): { bg: string; text: string } {
  if (intensity === 0) return { bg: '#f1f5f9', text: '#475569' };
  if (intensity < 0.25) return { bg: '#bfdbfe', text: '#475569' };
  if (intensity < 0.5) return { bg: '#60a5fa', text: '#fff' };
  if (intensity < 0.75) return { bg: '#3b82f6', text: '#fff' };
  return { bg: '#1e40af', text: '#fff' };
}

// =============================================================
// 集計関数: イベント配列 → チャート用データ
// =============================================================

/** 日別推移データを構築 */
function cmAuditBuildDailyTrend(
  events: CmTimelineEvent[],
  days: number
): { date: string; pageViews: number; operations: number; dataChanges: number }[] {
  const buckets = new Map<string, { pageViews: number; operations: number; dataChanges: number }>();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    buckets.set(key, { pageViews: 0, operations: 0, dataChanges: 0 });
  }

  for (const ev of events) {
    const d = new Date(ev.timestamp);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (ev.event_type === 'page_view') {
      bucket.pageViews++;
    } else {
      bucket.operations++;
      bucket.dataChanges += ev.db_changes.length;
    }
  }

  return Array.from(buckets.entries()).map(([date, vals]) => ({ date, ...vals }));
}

/** カテゴリ内訳データを構築 */
function cmAuditBuildCategoryData(
  events: CmTimelineEvent[]
): { name: string; value: number; color: string }[] {
  const counts = new Map<string, number>();
  for (const ev of events) {
    if (ev.event_type !== 'operation' || !ev.category) continue;
    counts.set(ev.category, (counts.get(ev.category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, count]) => ({
      name: CM_AUDIT_CATEGORY_LABELS[cat] ?? cat,
      value: count,
      color: CM_AUDIT_CATEGORY_COLORS[cat] ?? CM_AUDIT_DEFAULT_CATEGORY_COLOR,
    }));
}

/** ユーザー別アクティビティを構築 */
function cmAuditBuildUserStats(sessions: CmAuditSession[]): CmAuditUserStat[] {
  const userMap = new Map<string, CmAuditUserStat>();

  for (const session of sessions) {
    const name = cmAuditSessionDisplayName(session);
    const existing = userMap.get(session.user_id) ?? {
      name,
      userId: session.user_id,
      operations: 0,
      pageViews: 0,
      lastAccess: '',
      changes: 0,
    };

    for (const ev of session.events) {
      if (ev.event_type === 'page_view') {
        existing.pageViews++;
      } else {
        existing.operations++;
        existing.changes += ev.db_changes.length;
      }
    }

    const sessionLast = session.last_timestamp;
    if (!existing.lastAccess || sessionLast > existing.lastAccess) {
      existing.lastAccess = sessionLast;
    }

    userMap.set(session.user_id, existing);
  }

  return Array.from(userMap.values())
    .sort((a, b) => b.operations - a.operations);
}

/** 注目操作（高severity）を抽出 */
function cmAuditBuildImportantOps(events: CmTimelineEvent[]): CmAuditImportantOp[] {
  return events
    .filter((ev) => ev.event_type === 'operation')
    .map((ev) => ({
      time: cmAuditFormatTime(ev.timestamp),
      user: cmAuditDisplayName(ev),
      action: ev.action,
      target: ev.description ?? ev.resource_type ?? '',
      severity: cmAuditGetSeverity(ev.action),
    }))
    .sort((a, b) => {
      const order: Record<CmAuditSeverity, number> = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    })
    .slice(0, 8);
}

/** 曜日×時間帯ヒートマップを構築 */
function cmAuditBuildHeatmap(events: CmTimelineEvent[]): CmAuditHeatmapCell[] {
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  const grid = new Map<string, number>();

  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      grid.set(`${d}-${h}`, 0);
    }
  }

  for (const ev of events) {
    const date = new Date(ev.timestamp);
    const jsDay = date.getDay();
    const dayIdx = jsDay === 0 ? 6 : jsDay - 1;
    const h = date.getHours();
    if (h >= 6 && h <= 21) {
      const key = `${dayIdx}-${h}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
  }

  const data: CmAuditHeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 6; h <= 21; h++) {
      data.push({
        day: days[d],
        dayIndex: d,
        hour: h,
        count: grid.get(`${d}-${h}`) ?? 0,
      });
    }
  }
  return data;
}

/** 時間帯別バーチャートデータを構築 */
function cmAuditBuildHourlyTimeline(
  events: CmTimelineEvent[]
): { hour: string; operations: number; pageViews: number }[] {
  const buckets = Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    operations: 0,
    pageViews: 0,
  }));

  for (const ev of events) {
    const h = new Date(ev.timestamp).getHours();
    if (ev.event_type === 'page_view') {
      buckets[h].pageViews++;
    } else {
      buckets[h].operations++;
    }
  }

  return buckets;
}

// =============================================================
// ツールチップ（旧版と同一）
// =============================================================

type CmAuditTooltipPayload = {
  name: string;
  value: number;
  color: string;
};

type CmAuditTooltipProps = {
  active?: boolean;
  payload?: CmAuditTooltipPayload[];
  label?: string;
};

function CmAuditChartTooltip({ active, payload, label }: CmAuditTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} className={styles.tooltipRow}>
          <div className={styles.tooltipDot} style={{ backgroundColor: p.color }} />
          <span className={styles.tooltipName}>{p.name}:</span>
          <span className={styles.tooltipValue}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================
// ヒートマップコンポーネント（旧版と同一）
// =============================================================

function CmAuditAccessHeatmap({ data }: { data: CmAuditHeatmapCell[] }) {
  const days = ['月', '火', '水', '木', '金', '土', '日'];
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.heatmapInner}>
        <div className={styles.heatmapHourLabels}>
          {hours.map((h) => (
            <div key={h} className={styles.heatmapHourLabel}>{h}</div>
          ))}
        </div>
        {days.map((day, di) => (
          <div key={day} className={styles.heatmapRow}>
            <div className={styles.heatmapDayLabel}>{day}</div>
            {hours.map((h) => {
              const cell = data.find((d) => d.dayIndex === di && d.hour === h);
              const count = cell?.count ?? 0;
              const intensity = maxCount > 0 ? count / maxCount : 0;
              const { bg, text } = cmAuditHeatmapColor(intensity);
              return (
                <div key={h} className={styles.heatmapCellWrap}>
                  <div
                    className={styles.heatmapCell}
                    style={{ backgroundColor: bg, color: text }}
                    title={`${count}件`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div className={styles.heatmapLegend}>
          <span className={styles.heatmapLegendLabel}>少</span>
          {['#f1f5f9', '#bfdbfe', '#60a5fa', '#3b82f6', '#1e40af'].map((c) => (
            <div key={c} className={styles.heatmapLegendSwatch} style={{ backgroundColor: c }} />
          ))}
          <span className={styles.heatmapLegendLabel}>多</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================
// ナビカード定義
// =============================================================

type CmAuditNavCardDef = {
  id: string;
  label: string;
  description: string;
  href: string;
  Icon: React.ElementType;
  color: CmAuditColorSet;
  statLabel: string;
};

const CM_AUDIT_NAV_CARDS: CmAuditNavCardDef[] = [
  {
    id: 'operations',
    label: '操作ログ一覧',
    description: 'ユーザー操作・DB変更をフィルター検索',
    href: '/cm-portal/audit/operations',
    Icon: List,
    color: CM_AUDIT_PALETTE.blue,
    statLabel: '本日の操作',
  },
  {
    id: 'flow',
    label: '経路フロー',
    description: '操作の因果関係をトレースID単位で可視化',
    href: '/cm-portal/audit/flow',
    Icon: GitBranch,
    color: CM_AUDIT_PALETTE.violet,
    statLabel: '本日のセッション',
  },
  {
    id: 'logs',
    label: 'システムログ',
    description: 'warn / error レベルのログを確認',
    href: '/cm-portal/audit/logs',
    Icon: Terminal,
    color: CM_AUDIT_PALETTE.cyan,
    statLabel: 'ログ管理',
  },
];

// =============================================================
// メインコンポーネント
// =============================================================

export function CmAuditDashboardPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<CmAuditPeriod>('today');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<CmAuditSession[]>([]);

  // ----------------------------------------------------------
  // 全イベントをフラット化
  // ----------------------------------------------------------
  const flatEvents = useMemo<CmTimelineEvent[]>(() => {
    const events: CmTimelineEvent[] = [];
    for (const session of sessions) {
      for (const ev of session.events) {
        events.push(ev);
      }
    }
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return events;
  }, [sessions]);

  // ----------------------------------------------------------
  // 各種集計データ
  // ----------------------------------------------------------
  const activeUsers = useMemo(() => {
    const uniqueUsers = new Set(sessions.map((s) => s.user_id));
    return uniqueUsers.size;
  }, [sessions]);

  const operationCount = useMemo(
    () => flatEvents.filter((e) => e.event_type === 'operation').length,
    [flatEvents]
  );

  const pageViewCount = useMemo(
    () => flatEvents.filter((e) => e.event_type === 'page_view').length,
    [flatEvents]
  );

  const dbChangeCount = useMemo(
    () => flatEvents.reduce((sum, e) => sum + e.db_changes.length, 0),
    [flatEvents]
  );

  const dailyTrend = useMemo(() => {
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    return cmAuditBuildDailyTrend(flatEvents, days);
  }, [flatEvents, period]);

  const categoryData = useMemo(
    () => cmAuditBuildCategoryData(flatEvents),
    [flatEvents]
  );

  const userStats = useMemo(
    () => cmAuditBuildUserStats(sessions),
    [sessions]
  );

  const importantOps = useMemo(
    () => cmAuditBuildImportantOps(flatEvents),
    [flatEvents]
  );

  const heatmapData = useMemo(
    () => cmAuditBuildHeatmap(flatEvents),
    [flatEvents]
  );

  const hourlyTimeline = useMemo(
    () => cmAuditBuildHourlyTimeline(flatEvents),
    [flatEvents]
  );

  // ナビカードの統計値
  const navCardStats: Record<string, string> = useMemo(() => ({
    operations: `${operationCount}件`,
    flow: `${sessions.length}件`,
    logs: '閲覧',
  }), [operationCount, sessions.length]);

  // サマリーカード
  const summaryItems = useMemo(() => [
    { label: 'アクティブユーザー', value: activeUsers,    sub: '本日', color: CM_AUDIT_PALETTE.blue,    Icon: Users },
    { label: '操作件数',          value: operationCount, sub: '本日', color: CM_AUDIT_PALETTE.violet,  Icon: Zap },
    { label: 'DB変更件数',        value: dbChangeCount,  sub: '本日', color: CM_AUDIT_PALETTE.cyan,    Icon: RefreshCw },
    { label: 'ページ閲覧',        value: pageViewCount,  sub: '本日', color: CM_AUDIT_PALETTE.emerald, Icon: Eye },
  ], [activeUsers, operationCount, dbChangeCount, pageViewCount]);

  // ----------------------------------------------------------
  // データ取得
  // ----------------------------------------------------------
  const fetchData = useCallback(async (p: CmAuditPeriod) => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) return;

      const daysMap: Record<CmAuditPeriod, number> = { today: 0, '7d': 7, '30d': 30 };
      const startDate = cmAuditDaysAgoStart(daysMap[p]);

      const filter: CmAuditLogFilter = {
        start_date: startDate,
        end_date: null,
        user_id: null,
        category: null,
        table_name: null,
        operation: null,
        record_id: null,
        page: 1,
        per_page: 50,
      };

      const result = await cmGetTimeline(filter, token);
      if (result.ok) {
        setSessions(result.sessions);
      } else {
        console.error('[CmAuditDashboardPage] タイムライン取得エラー:', result.error);
      }
    } catch (error) {
      console.error('[CmAuditDashboardPage] 予期せぬエラー:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    fetchData(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 期間切替時
  const handlePeriodChange = useCallback((p: CmAuditPeriod) => {
    setPeriod(p);
    fetchData(p);
  }, [fetchData]);

  // ユーザー行クリック → 操作ログ一覧にフィルター付き遷移
  const handleUserRowClick = useCallback((user: CmAuditUserStat) => {
    router.push(`/cm-portal/audit/operations?user=${encodeURIComponent(user.name)}`);
  }, [router]);

  // 重要操作クリック → 操作ログ一覧にフィルター付き遷移
  const handleImportantOperationClick = useCallback((item: CmAuditImportantOp) => {
    router.push(
      `/cm-portal/audit/operations?action=${encodeURIComponent(item.action)}&user=${encodeURIComponent(item.user)}`
    );
  }, [router]);

  // ----------------------------------------------------------
  // レンダリング
  // ----------------------------------------------------------
  return (
    <div className={styles.container}>

      {/* ===== ヘッダー ===== */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>
            <span className={styles.headerIcon}>
              <LayoutDashboard />
            </span>
            監査ダッシュボード
          </h2>
          <p className={styles.headerDescription}>
            監査データの概要を確認し、各ツールへ素早くアクセスできます
          </p>
        </div>
        <div className={styles.periodSelector}>
          {([
            { key: 'today' as const, label: '今日' },
            { key: '7d' as const, label: '7日間' },
            { key: '30d' as const, label: '30日間' },
          ]).map((p) => (
            <button
              key={p.key}
              onClick={() => handlePeriodChange(p.key)}
              className={`${styles.periodButton} ${period === p.key ? styles.periodButtonActive : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== ナビゲーションカード（ハブ） ===== */}
      <div className={styles.navGrid}>
        {CM_AUDIT_NAV_CARDS.map((navCard) => (
          <Link key={navCard.id} href={navCard.href} className={styles.navCard}>
            <div className={styles.navCardAccent} style={{ background: `linear-gradient(90deg, ${navCard.color.main}, ${navCard.color.muted})` }} />
            <div className={styles.navCardBody}>
              <div className={styles.navCardContent}>
                <div className={styles.navCardHeader}>
                  <div className={styles.navCardIcon} style={{ backgroundColor: navCard.color.light }}>
                    <navCard.Icon style={{ color: navCard.color.main }} />
                  </div>
                  <div className={styles.navCardLabel}>{navCard.label}</div>
                </div>
                <p className={styles.navCardDescription}>{navCard.description}</p>
                <div className={styles.navCardStat}>
                  <span className={styles.navCardStatValue} style={{ color: navCard.color.main }}>
                    {loading ? '—' : navCardStats[navCard.id]}
                  </span>
                  <span className={styles.navCardStatLabel}>{navCard.statLabel}</span>
                </div>
              </div>
              <ArrowUpRight className={styles.navCardArrow} size={16} />
            </div>
          </Link>
        ))}
      </div>

      {/* ===== サマリーカード ===== */}
      <div className={styles.summaryGrid}>
        {summaryItems.map((item) => (
          <div key={item.label} className={styles.summaryCard}>
            <div className={styles.summaryIcon} style={{ backgroundColor: item.color.light }}>
              <item.Icon style={{ color: item.color.main }} />
            </div>
            <div>
              <div className={styles.summaryLabel}>{item.label}</div>
              <div className={styles.summaryValue} style={{ color: item.color.main }}>
                {loading ? '—' : item.value.toLocaleString()}
              </div>
              <div className={styles.summarySub}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== 日別推移 + カテゴリ内訳 ===== */}
      <div className={styles.chartRow}>
        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>日別アクティビティ推移</h3>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: CM_AUDIT_PALETTE.blue.muted }} />
                閲覧
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: CM_AUDIT_PALETTE.violet.main }} />
                操作
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ backgroundColor: CM_AUDIT_PALETTE.cyan.main }} />
                DB変更
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="cmAuditGradPV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CM_AUDIT_PALETTE.blue.muted} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={CM_AUDIT_PALETTE.blue.muted} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cmAuditGradOP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CM_AUDIT_PALETTE.violet.main} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CM_AUDIT_PALETTE.violet.main} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="cmAuditGradDC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CM_AUDIT_PALETTE.cyan.main} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={CM_AUDIT_PALETTE.cyan.main} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
              <Tooltip content={<CmAuditChartTooltip />} />
              <Area type="monotone" dataKey="pageViews" name="閲覧" stroke={CM_AUDIT_PALETTE.blue.muted} fill="url(#cmAuditGradPV)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="dataChanges" name="DB変更" stroke={CM_AUDIT_PALETTE.cyan.main} fill="url(#cmAuditGradDC)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="operations" name="操作" stroke={CM_AUDIT_PALETTE.violet.main} fill="url(#cmAuditGradOP)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>操作カテゴリ内訳</h3>
          </div>
          {categoryData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={65}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="#fff"
                  >
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { name: string; value: number };
                      return (
                        <div className={styles.tooltip}>
                          <span className={styles.tooltipValue}>{d.name}</span>
                          <span className={styles.tooltipName} style={{ marginLeft: 4 }}>{d.value}件</span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className={styles.categoryList}>
                {categoryData.map((c) => (
                  <div key={c.name} className={styles.categoryItem}>
                    <div className={styles.categoryItemLeft}>
                      <div className={styles.categoryDot} style={{ backgroundColor: c.color }} />
                      <span className={styles.categoryName}>{c.name}</span>
                    </div>
                    <span className={styles.categoryValue}>{c.value}件</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
              操作データがありません
            </div>
          )}
        </div>
      </div>

      {/* ===== ユーザー別 + 注目操作 ===== */}
      <div className={styles.twoColRow}>
        {/* ユーザー別アクティビティ */}
        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>ユーザー別アクティビティ</h3>
            <Link href="/cm-portal/audit/operations" className={styles.linkButton}>
              全ユーザー <ChevronRight />
            </Link>
          </div>
          <div className={styles.userTableHint}>
            <Filter />
            行をクリック → 操作ログ一覧にフィルター付き遷移
          </div>
          {userStats.length > 0 ? (
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>ユーザー</th>
                  <th>操作</th>
                  <th>閲覧</th>
                  <th>DB変更</th>
                  <th>最終</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u) => (
                  <tr
                    key={u.userId}
                    className={styles.userRow}
                    onClick={() => handleUserRowClick(u)}
                  >
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.userAvatar}>{u.name.charAt(0)}</div>
                        <span className={styles.userName}>{u.name}</span>
                      </div>
                    </td>
                    <td className={styles.userOps} style={{ color: CM_AUDIT_PALETTE.violet.main }}>{u.operations}</td>
                    <td className={styles.userViews}>{u.pageViews}</td>
                    <td className={styles.userChanges} style={{ color: CM_AUDIT_PALETTE.cyan.main }}>{u.changes}</td>
                    <td className={styles.userTime}>{u.lastAccess ? cmAuditFormatTime(u.lastAccess) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
              ユーザーデータがありません
            </div>
          )}
        </div>

        {/* 直近の注目操作 */}
        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>直近の注目操作</h3>
            <span className={styles.sectionRight}>DELETE・一括変更・権限変更等</span>
          </div>
          <div className={styles.userTableHint}>
            <Filter />
            行をクリック → 操作ログ一覧にフィルター付き遷移
          </div>
          {importantOps.length > 0 ? (
            <div className={styles.importantList}>
              {importantOps.map((item, i) => {
                const severity = CM_AUDIT_SEVERITY_STYLES[item.severity];
                return (
                  <button
                    key={i}
                    className={styles.importantItem}
                    style={{ backgroundColor: severity.bg, borderColor: severity.border }}
                    onClick={() => handleImportantOperationClick(item)}
                  >
                    <div className={styles.importantDot} style={{ backgroundColor: severity.dot }} />
                    <div className={styles.importantTime}>{item.time}</div>
                    <div className={styles.importantContent}>
                      <span className={styles.importantAction} style={{ color: severity.text }}>
                        {item.action}
                      </span>
                      <span className={styles.importantTarget}>{item.target}</span>
                    </div>
                    <div className={styles.importantUser}>{item.user}</div>
                    <ArrowRight className={styles.importantArrow} size={14} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
              注目操作はありません
            </div>
          )}
        </div>
      </div>

      {/* ===== ヒートマップ + 時間帯別 ===== */}
      <div className={styles.twoColRow}>
        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>曜日×時間帯 アクセス分布</h3>
            <span className={styles.sectionRight}>選択期間の操作回数</span>
          </div>
          <CmAuditAccessHeatmap data={heatmapData} />
        </div>

        <div className={styles.chartCard}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>本日の時間帯別アクティビティ</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourlyTimeline} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<CmAuditChartTooltip />} />
              <Bar dataKey="pageViews" name="閲覧" fill={CM_AUDIT_PALETTE.blue.muted} radius={[3, 3, 0, 0]} />
              <Bar dataKey="operations" name="操作" fill={CM_AUDIT_PALETTE.violet.main} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== フッター ===== */}
      <div className={styles.footer}>
        <p className={styles.footerText}>
          最終更新: {new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          &nbsp;·&nbsp;
          ページ遷移は CmPageViewTracker が自動記録
        </p>
      </div>
    </div>
  );
}