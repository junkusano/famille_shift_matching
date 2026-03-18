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
//
// 分割構成:
//   型定義        → types/cm/auditDashboard.ts
//   定数          → constants/cm/auditDashboard.ts
//   集計ロジック  → lib/cm/audit/dashboardAggregation.ts
//   ツールチップ  → CmAuditChartTooltip.tsx
//   ヒートマップ  → CmAuditAccessHeatmap.tsx
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
import {
  cmAuditPeriodLabel,
  cmAuditPeriodPrefix,
  cmAuditDaysAgoStart,
  cmAuditFormatTime,
  cmAuditBuildDailyTrend,
  cmAuditBuildCategoryData,
  cmAuditBuildUserStats,
  cmAuditBuildImportantOps,
  cmAuditBuildHeatmap,
  cmAuditBuildHourlyTimeline,
} from '@/lib/cm/audit/dashboardAggregation';
import {
  CM_AUDIT_PALETTE,
  CM_AUDIT_SEVERITY_STYLES,
  CM_AUDIT_NAV_CARDS,
} from '@/constants/cm/auditDashboard';
import { CmAuditChartTooltip } from '@/components/cm-components/audit/CmAuditChartTooltip';
import { CmAuditAccessHeatmap } from '@/components/cm-components/audit/CmAuditAccessHeatmap';
import type {
  CmAuditLogFilter,
  CmAuditSession,
  CmTimelineEvent,
} from '@/types/cm/operationLog';
import type {
  CmAuditPeriod,
  CmAuditUserStat,
  CmAuditImportantOp,
} from '@/types/cm/auditDashboard';
import styles from '@/styles/cm-styles/components/auditDashboard.module.css';

// =============================================================
// ユーティリティ（コンポーネントローカル）
// =============================================================

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

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

  // ナビカードの期間ラベル（period に応じて動的に切り替え）
  const navCardStatLabels: Record<string, string> = useMemo(() => {
    const prefix = cmAuditPeriodPrefix(period);
    return {
      operations: `${prefix}操作`,
      flow: `${prefix}セッション`,
      logs: 'ログ管理',
    };
  }, [period]);

  // サマリーカード（period に応じて動的に切り替え）
  const periodLabel = cmAuditPeriodLabel(period);
  const summaryItems = useMemo(() => [
    { label: 'アクティブユーザー', value: activeUsers,    sub: periodLabel, color: CM_AUDIT_PALETTE.blue,    Icon: Users },
    { label: '操作件数',          value: operationCount, sub: periodLabel, color: CM_AUDIT_PALETTE.violet,  Icon: Zap },
    { label: 'DB変更件数',        value: dbChangeCount,  sub: periodLabel, color: CM_AUDIT_PALETTE.cyan,    Icon: RefreshCw },
    { label: 'ページ閲覧',        value: pageViewCount,  sub: periodLabel, color: CM_AUDIT_PALETTE.emerald, Icon: Eye },
  ], [activeUsers, operationCount, dbChangeCount, pageViewCount, periodLabel]);

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
                  <span className={styles.navCardStatLabel}>{navCardStatLabels[navCard.id]}</span>
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
            <h3 className={styles.sectionTitle}>{cmAuditPeriodPrefix(period)}時間帯別アクティビティ</h3>
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